import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const handler = (message) => (req, res, next, options) => {
  res.status(options.statusCode).json({ success: false, message });
};

const base = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

/** POST /api/auth/login — 5 attempts / 15 min / IP by default. */
export const rateLimitLogin = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  skipSuccessfulRequests: true,
  handler: handler('Too many login attempts. Please try again in 15 minutes.'),
});

/** POST /api/orders — guest checkout. */
export const rateLimitCheckout = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_CHECKOUT_MAX,
  handler: handler('Too many orders from this device. Please try again later.'),
});

/** POST /api/orders/:orderNumber/payment-reference */
export const rateLimitPaymentRef = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_PAYMENT_MAX,
  handler: handler('Too many payment submissions. Please try again later.'),
});

/** Light limit for public read endpoints that take an order number (tracking/receipt). */
export const rateLimitPublicLookup = rateLimit({
  ...base,
  limit: 60,
  handler: handler('Too many requests. Please try again later.'),
});

/** Gateway webhook — generous, signature is the real protection. */
export const rateLimitWebhook = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: handler('Too many webhook calls'),
});

/** Two-step codes and password reset: 10 requests / 15 min / IP. */
export const rateLimitOtp = rateLimit({
  ...base,
  limit: 10,
  handler: handler('Too many verification attempts. Please try again in 15 minutes.'),
});
