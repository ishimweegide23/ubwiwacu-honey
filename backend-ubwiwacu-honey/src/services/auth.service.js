import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { AUDIT_ACTIONS, USER_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { recordAuditSafe } from '../middleware/audit.middleware.js';
import { consumeCode, issueCode } from './otp.service.js';

// --- Per-email lockout (in memory) -----------------------------------------
// 5 failed attempts within 15 minutes locks that email for 15 minutes,
// on top of the per-IP rate limit. Resets on successful login or restart.
const MAX_FAILED = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map(); // email -> { count, firstAt, lockedUntil }

// A real bcrypt hash of a random string, used to keep timing equal for unknown emails.
const DUMMY_HASH = bcrypt.hashSync(`dummy-${Date.now()}`, 10);

function lockedUntil(email) {
  const entry = attempts.get(email);
  if (!entry) return null;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return entry.lockedUntil;
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) attempts.delete(email);
  return null;
}

function registerFailure(email) {
  const now = Date.now();
  const entry = attempts.get(email);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(email, { count: 1, firstAt: now, lockedUntil: null });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILED) entry.lockedUntil = now + LOCK_MS;
}

// Housekeeping so the map cannot grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of attempts) {
    if ((entry.lockedUntil ?? 0) < now && now - entry.firstAt > WINDOW_MS) attempts.delete(email);
  }
}, 10 * 60 * 1000).unref();

// --- Public API ---------------------------------------------------------------

export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
    last_login_at: user.last_login_at ?? null,
    two_factor_enabled: user.two_factor_enabled ?? true,
  };
}


export async function findActiveUserById(id) {
  if (!id) return null;
  const { rows } = await query(
    `SELECT id, name, email, phone, role, status, last_login_at, two_factor_enabled, password_changed_at
       FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

// Short-lived signed tokens that carry a user through a multi-step flow.
const STEP_TTL = '15m';
const signStep = (userId, purpose) => jwt.sign({ id: userId, purpose }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: STEP_TTL });
function readStep(token, purpose) {
  try {
    const payload = jwt.verify(String(token || ''), env.JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.purpose !== purpose) throw new Error('wrong purpose');
    return payload.id;
  } catch {
    throw ApiError.unauthorized(
      purpose === 'login_2fa' ? 'Your sign-in session expired. Sign in again.' : 'Your reset session expired. Start again.',
    );
  }
}

/** Staff password rule: 8+ characters with at least one letter and one number. */
export function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Use at least 8 characters';
  if (p.length > 200) return 'Password is too long';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use at least one letter and one number';
  return null;
}

async function completeLogin(userId, actor, details = null) {
  const updated = await query(
    `UPDATE users SET last_login_at = now(), updated_at = now()
      WHERE id = $1
      RETURNING id, name, email, phone, role, status, last_login_at, two_factor_enabled`,
    [userId],
  );
  recordAuditSafe({
    actor: { userId, ip: actor?.ip },
    action: AUDIT_ACTIONS.LOGIN,
    recordType: 'user',
    recordId: userId,
    details,
  });
  const fresh = updated.rows[0];
  return { token: signToken(fresh), expires_in: env.JWT_EXPIRES_IN, user: toPublicUser(fresh) };
}

/**
 * Step 1: check email + password.
 * - two-step off → { token, user }
 * - two-step on  → emails a 6-digit code and returns { two_factor: true, challenge, email_hint }
 * Generic error message so we never reveal whether the email exists.
 */
export async function login({ email, password }, actor) {
  const normEmail = String(email).trim().toLowerCase();

  const until = lockedUntil(normEmail);
  if (until) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    throw ApiError.tooMany(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }

  const { rows } = await query(
    `SELECT id, name, email, phone, role, status, password_hash, last_login_at, two_factor_enabled
       FROM users WHERE lower(email) = $1`,
    [normEmail],
  );
  const user = rows[0];

  const ok = await bcrypt.compare(String(password), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    registerFailure(normEmail);
    recordAuditSafe({
      actor: { userId: user?.id ?? null, ip: actor?.ip },
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      recordType: 'user',
      recordId: user?.id ?? null,
      details: { email: normEmail },
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account is suspended');
  }

  attempts.delete(normEmail);

  if (user.two_factor_enabled) {
    const sent = await issueCode(user, 'login');
    return { two_factor: true, challenge: signStep(user.id, 'login_2fa'), ...sent };
  }
  return completeLogin(user.id, actor);
}

/** Step 2 of two-step login: the emailed code. */
export async function verifyLoginCode({ challenge, code }, actor) {
  const userId = readStep(challenge, 'login_2fa');
  const user = await findActiveUserById(userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) throw ApiError.unauthorized('Account not found or suspended');
  try {
    await consumeCode(userId, 'login', code);
  } catch (err) {
    recordAuditSafe({
      actor: { userId, ip: actor?.ip },
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      recordType: 'user',
      recordId: userId,
      details: { step: 'two_factor' },
    });
    throw err;
  }
  return completeLogin(userId, actor, { two_factor: true });
}

export async function resendLoginCode({ challenge }) {
  const userId = readStep(challenge, 'login_2fa');
  const user = await findActiveUserById(userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) throw ApiError.unauthorized('Account not found or suspended');
  return issueCode(user, 'login', { enforceCooldown: true });
}

/**
 * Forgot password, step 1. Always answers the same way so nobody can probe which emails exist;
 * a code is only emailed when an active account matches.
 */
export async function forgotPassword({ email }, actor) {
  const normEmail = String(email).trim().toLowerCase();
  const { rows } = await query(`SELECT id, name, email, status FROM users WHERE lower(email) = $1`, [normEmail]);
  const user = rows[0];
  if (user && user.status === USER_STATUS.ACTIVE) {
    await issueCode(user, 'reset', { enforceCooldown: true });
    recordAuditSafe({
      actor: { userId: user.id, ip: actor?.ip },
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUEST,
      recordType: 'user',
      recordId: user.id,
      details: null,
    });
  }
  return { sent: true, expires_in_minutes: 10 };
}

/** Forgot password, step 2: check the code and hand back a short-lived reset token. */
export async function verifyResetCode({ email, code }) {
  const normEmail = String(email).trim().toLowerCase();
  const { rows } = await query(`SELECT id, status FROM users WHERE lower(email) = $1`, [normEmail]);
  const user = rows[0];
  if (!user || user.status !== USER_STATUS.ACTIVE) throw ApiError.badRequest('This code has expired. Ask for a new one.');
  await consumeCode(user.id, 'reset', code);
  return { reset_token: signStep(user.id, 'password_reset') };
}

async function savePassword(userId, password) {
  const problem = passwordProblem(password);
  if (problem) throw ApiError.unprocessable(problem, [{ field: 'password', message: problem }]);
  const hash = await bcrypt.hash(String(password), 12);
  // password_changed_at makes every token issued before now stop working (see auth middleware).
  await query(
    `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`,
    [userId, hash],
  );
}

/** Forgot password, step 3: set the new password. */
export async function resetPassword({ reset_token, password }, actor) {
  const userId = readStep(reset_token, 'password_reset');
  await savePassword(userId, password);
  await query(`UPDATE auth_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  recordAuditSafe({
    actor: { userId, ip: actor?.ip },
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    recordType: 'user',
    recordId: userId,
    details: null,
  });
  return { reset: true };
}

async function checkCurrentPassword(userId, password) {
  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!rows[0] || !(await bcrypt.compare(String(password || ''), rows[0].password_hash))) {
    throw ApiError.unprocessable('Your current password is incorrect', [
      { field: 'current_password', message: 'Your current password is incorrect' },
    ]);
  }
}

/** Signed-in user changes their own password; returns a fresh token (old ones stop working). */
export async function changePassword(userId, { current_password, new_password }, actor) {
  await checkCurrentPassword(userId, current_password);
  await savePassword(userId, new_password);
  recordAuditSafe({
    actor: { userId, ip: actor?.ip },
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    recordType: 'user',
    recordId: userId,
    details: null,
  });
  const user = await findActiveUserById(userId);
  return { token: signToken(user), user: toPublicUser(user) };
}

/** Turn two-step sign-in on or off (password required). */
export async function setTwoFactor(userId, { enabled, password }, actor) {
  await checkCurrentPassword(userId, password);
  await query(`UPDATE users SET two_factor_enabled = $2, updated_at = now() WHERE id = $1`, [userId, Boolean(enabled)]);
  recordAuditSafe({
    actor: { userId, ip: actor?.ip },
    action: AUDIT_ACTIONS.TWO_FACTOR_CHANGE,
    recordType: 'user',
    recordId: userId,
    details: { enabled: Boolean(enabled) },
  });
  return toPublicUser(await findActiveUserById(userId));
}

export async function getMe(userId) {
  const user = await findActiveUserById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}
