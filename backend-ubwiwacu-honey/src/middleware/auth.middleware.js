import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { USER_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { findActiveUserById } from '../services/auth.service.js';

/**
 * Verifies "Authorization: Bearer <token>", re-loads the user from the DB
 * (so suspended users lose access immediately) and attaches req.user.
 */
export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Authentication required');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const user = await findActiveUserById(payload.id);
    if (!user || user.status !== USER_STATUS.ACTIVE) {
      throw ApiError.unauthorized('Account not found or suspended');
    }
    // Step tokens (2FA / reset) are not session tokens; and a password change ends older sessions.
    if (payload.purpose) throw ApiError.unauthorized('Invalid or expired token');
    if (user.password_changed_at && payload.iat * 1000 < new Date(user.password_changed_at).getTime() - 1000) {
      throw ApiError.unauthorized('Your password was changed. Please sign in again.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** requireRole('admin', 'manager') — must run after authMiddleware. */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (allowed.length && !allowed.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}

export default authMiddleware;
