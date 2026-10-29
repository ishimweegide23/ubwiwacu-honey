import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as paymentController from '../controllers/payment.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { auditContext } from '../middleware/audit.middleware.js';
import { rateLimitPaymentRef } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  ALL_PAYMENT_METHODS,
  ALL_PAYMENT_STATUSES,
  REFERENCE_PAYMENT_METHODS,
  ROLE_GROUPS,
} from '../config/constants.js';
import { PHONE_REGEX } from './order.routes.js';

const router = Router();

const noSecrets = body(['pin', 'password', 'card_number', 'cvv'])
  .not()
  .exists()
  .withMessage('Never send PINs, passwords or card details');

// ---------- Public: customer submits a transaction reference ----------
router.post(
  '/orders/:orderNumber/payment-reference',
  rateLimitPaymentRef,
  validate([
    param('orderNumber').isString().trim().matches(/^UBH-\d{4}-\d{4,}$/i).withMessage('Invalid order number'),
    body('transaction_ref').isString().trim().isLength({ min: 4, max: 120 })
      .withMessage('Transaction reference must be 4-120 characters')
      .matches(/^[A-Za-z0-9.\-_/ ]+$/).withMessage('Transaction reference contains invalid characters'),
    body('method').isIn(REFERENCE_PAYMENT_METHODS)
      .withMessage(`method must be one of: ${REFERENCE_PAYMENT_METHODS.join(', ')}`),
    body('phone').isString().trim().matches(PHONE_REGEX)
      .withMessage('Enter the phone number used when placing the order'),
    noSecrets,
  ]),
  auditContext,
  paymentController.submitReference,
);

// ---------- Admin ----------
const admin = [authMiddleware, requireRole(ROLE_GROUPS.PAYMENTS), auditContext];
const orderIdParam = param('orderId').isUUID().withMessage('Invalid order id');

router.get(
  '/admin/payments',
  ...admin,
  validate([
    query('status').optional().isIn(ALL_PAYMENT_STATUSES),
    query('method').optional().isIn(ALL_PAYMENT_METHODS),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('q').optional().isString().isLength({ max: 100 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  paymentController.list,
);

router.put(
  '/admin/payments/:orderId/verify',
  ...admin,
  validate([
    orderIdParam,
    body('payment_id').optional({ values: 'falsy' }).isUUID(),
    body('transaction_ref').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 120 }),
    body('method').optional({ values: 'falsy' }).isIn(['mtn_momo', 'airtel', 'bank', 'cash']),
    body('note').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
    noSecrets,
  ]),
  paymentController.verify,
);

router.put(
  '/admin/payments/:orderId/reject',
  ...admin,
  validate([
    orderIdParam,
    body('payment_id').optional({ values: 'falsy' }).isUUID(),
    body('rejection_reason').isString().trim().notEmpty().withMessage('rejection_reason is required').isLength({ max: 500 }),
  ]),
  paymentController.reject,
);

export default router;
