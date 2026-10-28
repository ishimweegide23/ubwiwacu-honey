import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ApiError } from '../utils/apiError.js';
import { escapeHtml } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { isEmailConfigured, sendMail } from './email.service.js';

// One-time 6-digit codes for two-step login and password reset.
// Only an HMAC of the code is stored; codes expire, allow 5 tries and can be resent once a minute.
export const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 60;

const hashCode = (code) => crypto.createHmac('sha256', env.JWT_SECRET).update(String(code)).digest('hex');

const PURPOSE_TEXT = {
  login: { subject: 'Your sign-in code', lead: 'Use this code to finish signing in to the Ubw’iwacu Honey admin.' },
  reset: { subject: 'Your password reset code', lead: 'Use this code to reset your Ubw’iwacu Honey admin password.' },
};

/** "a***n@gmail.com" — shown on screen so staff know where the code went. */
export function maskEmail(email = '') {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  const shown = name.length <= 2 ? name[0] : `${name[0]}${'*'.repeat(Math.min(name.length - 2, 5))}${name.at(-1)}`;
  return `${shown}@${domain}`;
}

async function deliver(user, purpose, code) {
  const t = PURPOSE_TEXT[purpose];
  if (!isEmailConfigured()) {
    if (env.isProd) {
      throw new ApiError(503, 'Verification email could not be sent: email is not configured on the server.');
    }
    // Development only: there is no mail server, so print the code for the developer.
    logger.warn(`[DEV ONLY] ${purpose} code for ${user.email}: ${code} (set EMAIL_PASS to send real emails)`);
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#2b1d0e">
      <h2 style="margin:0 0 8px">Ubw’iwacu Honey</h2>
      <p>Hello ${escapeHtml(user.name || '')},</p>
      <p>${t.lead}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#fdf1dc;padding:16px;text-align:center;border-radius:12px">${code}</p>
      <p>The code expires in ${OTP_TTL_MIN} minutes. Never share it with anyone, including our staff.</p>
      <p style="color:#7a6650;font-size:13px">If you did not ask for this code, change your password and tell an administrator.</p>
    </div>`;
  try {
    await sendMail({
      to: user.email,
      subject: `${t.subject}: ${code}`,
      html,
      text: `${t.lead}\n\nCode: ${code}\nIt expires in ${OTP_TTL_MIN} minutes. Never share it.`,
    });
  } catch (err) {
    logger.error(`OTP email failed for ${user.email}: ${err.message}`);
    throw new ApiError(503, 'We could not send the verification email. Please try again in a moment.');
  }
}

/** Create a new code (older unused codes for the same purpose stop working) and email it. */
export async function issueCode(user, purpose, { enforceCooldown = false } = {}) {
  if (enforceCooldown) {
    const { rows } = await query(
      `SELECT created_at FROM auth_codes WHERE user_id = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1`,
      [user.id, purpose],
    );
    const last = rows[0]?.created_at;
    const wait = last ? RESEND_COOLDOWN_S - Math.floor((Date.now() - new Date(last).getTime()) / 1000) : 0;
    if (wait > 0) throw ApiError.tooMany(`Please wait ${wait} seconds before asking for a new code.`);
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await query(`UPDATE auth_codes SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [user.id, purpose]);
  await query(
    `INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [user.id, purpose, hashCode(code), OTP_TTL_MIN],
  );
  await deliver(user, purpose, code);
  return { email_hint: maskEmail(user.email), expires_in_minutes: OTP_TTL_MIN, resend_after_seconds: RESEND_COOLDOWN_S };
}

/** Check a code. Throws a clear error when it is wrong, expired or used up; marks it used on success. */
export async function consumeCode(userId, purpose, code) {
  const { rows } = await query(
    `SELECT id, code_hash, attempts, expires_at FROM auth_codes
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  );
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    throw ApiError.badRequest('This code has expired. Ask for a new one.');
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw ApiError.tooMany('Too many wrong codes. Ask for a new one.');
  }
  const given = Buffer.from(hashCode(String(code).trim()));
  const stored = Buffer.from(row.code_hash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    await query(`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw ApiError.badRequest(left > 0 ? `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Wrong code. Ask for a new one.');
  }
  await query(`UPDATE auth_codes SET used_at = now() WHERE id = $1`, [row.id]);
}

// Housekeeping: drop codes older than a day.
setInterval(() => {
  query(`DELETE FROM auth_codes WHERE created_at < now() - interval '1 day'`).catch(() => {});
}, 60 * 60 * 1000).unref();
