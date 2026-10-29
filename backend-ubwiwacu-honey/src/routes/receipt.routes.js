import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as receiptController from '../controllers/receipt.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { auditContext } from '../middleware/audit.middleware.js';
import { rateLimitPublicLookup } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { ROLE_GROUPS } from '../config/constants.js';
import { PHONE_REGEX } from './order.routes.js';

const router = Router();

// ---------- Public: customer downloads own receipt (order number + phone) ----------
router.get(
  '/orders/:orderNumber/receipt',
  rateLimitPublicLookup,
  validate([
    param('orderNumber').isString().trim().matches(/^UBH-\d{4}-\d{4,}$/i).withMessage('Invalid order number'),
    query('phone').isString().trim().matches(PHONE_REGEX).withMessage('phone (used on the order) is required'),
  ]),
  receiptController.publicPdf,
);

// ---------- Admin ----------
const admin = [authMiddleware, requireRole(ROLE_GROUPS.RECEIPTS), auditContext];
const idParam = param('id').isUUID().withMessage('Invalid receipt id');

router.get(
  '/admin/receipts',
  ...admin,
  validate([
    query('deliveryStatus').optional().isIn(['pending', 'sent', 'failed']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('q').optional().isString().isLength({ max: 100 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  receiptController.list,
);

router.post('/admin/receipts/retry-failed', ...admin, receiptController.retryFailed);
router.get('/admin/receipts/:id', ...admin, validate([idParam]), receiptController.getById);
router.get('/admin/receipts/:id/pdf', ...admin, validate([idParam]), receiptController.pdf);
router.get('/admin/receipts/:id/html', ...admin, validate([idParam]), receiptController.html);
router.post(
  '/admin/receipts/:id/resend',
  ...admin,
  validate([idParam, body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email is invalid')]),
  receiptController.resend,
);

export default router;
