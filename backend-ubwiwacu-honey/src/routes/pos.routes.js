import { Router } from 'express';
import { body, param } from 'express-validator';
import * as posController from '../controllers/pos.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { auditContext } from '../middleware/audit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { POS_PAYMENT_METHODS, ROLE_GROUPS } from '../config/constants.js';
import { PHONE_REGEX } from './order.routes.js';

const router = Router();

router.post(
  '/pos/sale',
  authMiddleware,
  requireRole(ROLE_GROUPS.POS),
  auditContext,
  validate([
    body('items').isArray({ min: 1, max: 50 }).withMessage('items must be a non-empty list'),
    body('items.*.productId').isUUID().withMessage('Each item needs a valid productId'),
    body('items.*.quantity').isInt({ min: 1, max: 1000 }).withMessage('Quantity must be a whole number from 1 to 1000'),
    body('customer_name').optional({ values: 'falsy' }).isString().trim().isLength({ max: 120 }),
    body('customer_phone').optional({ values: 'falsy' }).isString().trim().matches(PHONE_REGEX).withMessage('Phone number is invalid'),
    body('customer_email').optional({ values: 'falsy' }).isEmail().withMessage('Email is invalid'),
    body('payment_method').isIn(POS_PAYMENT_METHODS).withMessage(`payment_method must be one of: ${POS_PAYMENT_METHODS.join(', ')}`),
    body('transaction_ref').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 120 }),
    body('notes').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }),
    body(['pin', 'password', 'card_number', 'cvv']).not().exists().withMessage('Never send PINs, passwords or card details'),
  ]),
  posController.sale,
);

router.post(
  '/pos/sale/:id/void',
  authMiddleware,
  requireRole(ROLE_GROUPS.POS_VOID),
  auditContext,
  validate([
    param('id').isUUID().withMessage('Invalid order id'),
    body('reason').isString().trim().notEmpty().withMessage('A reason is required to void a sale').isLength({ max: 500 }),
  ]),
  posController.voidSale,
);

export default router;
