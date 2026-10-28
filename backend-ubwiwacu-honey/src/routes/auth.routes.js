import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { auditContext } from '../middleware/audit.middleware.js';
import { rateLimitLogin, rateLimitOtp } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

const router = Router();

const emailRule = body('email').isString().trim().notEmpty().withMessage('Email is required')
  .bail().isEmail().withMessage('Email is invalid').normalizeEmail({ gmail_remove_dots: false });
const codeRule = body('code').isString().trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit code');
const tokenRule = (field) => body(field).isString().notEmpty().withMessage('Session expired. Start again.');
const passwordRule = (field) => body(field).isString().withMessage('Password is required')
  .bail().notEmpty().withMessage('Password is required').isLength({ max: 200 }).withMessage('Password is too long');

// POST /api/auth/login  → { token, user }  or  { two_factor:true, challenge, email_hint }
router.post('/auth/login', rateLimitLogin, validate([emailRule, passwordRule('password')]), auditContext, authController.login);

// Two-step sign-in: the 6-digit code emailed after the password
router.post('/auth/login/verify', rateLimitOtp, validate([tokenRule('challenge'), codeRule]), auditContext, authController.verifyLogin);
router.post('/auth/login/resend', rateLimitOtp, validate([tokenRule('challenge')]), authController.resendLogin);

// Forgot password: email → code → new password
router.post('/auth/password/forgot', rateLimitOtp, validate([emailRule]), auditContext, authController.forgotPassword);
router.post('/auth/password/verify', rateLimitOtp, validate([emailRule, codeRule]), authController.verifyReset);
router.post('/auth/password/reset', rateLimitOtp, validate([tokenRule('reset_token'), passwordRule('password')]), auditContext, authController.resetPassword);

// GET /api/auth/me
router.get('/auth/me', authMiddleware, authController.me);

// Signed-in account security
router.put('/auth/password', authMiddleware, rateLimitOtp, validate([passwordRule('current_password'), passwordRule('new_password')]), auditContext, authController.changePassword);
router.patch('/auth/two-factor', authMiddleware, validate([body('enabled').isBoolean().withMessage('enabled must be true or false').toBoolean(), passwordRule('password')]), auditContext, authController.setTwoFactor);

export default router;
