import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as orderController from '../controllers/order.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { auditContext } from '../middleware/audit.middleware.js';
import { rateLimitCheckout, rateLimitPublicLookup } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  ALL_FULFILMENT_STATUSES,
  ALL_ORDER_SOURCES,
  ALL_PAYMENT_STATUSES,
  CUSTOMER_PAYMENT_METHODS,
  MANUAL_ORDER_SOURCES,
  ROLE_GROUPS,
} from '../config/constants.js';

const router = Router();

export const PHONE_REGEX = /^\+?[0-9][0-9\s-]{7,18}$/;
const isDelivery = (value, { req }) => (req.body.fulfilment_type || 'delivery') === 'delivery';

const text = (field, max, label = field.replace(/_/g, ' ')) =>
  body(field).optional({ values: 'null' }).isString().withMessage(`${label} must be text`).trim().isLength({ max }).withMessage(`${label} is too long`);

const requiredForDelivery = (field, max) =>
  body(field)
    .if(isDelivery)
    .exists({ values: 'falsy' }).withMessage(`${field.replace(/_/g, ' ')} is required for delivery`)
    .bail()
    .isString().trim().notEmpty().withMessage(`${field.replace(/_/g, ' ')} is required for delivery`)
    .isLength({ max }).withMessage(`${field.replace(/_/g, ' ')} is too long`);

export const orderBodyRules = [
  body('items').isArray({ min: 1, max: 50 }).withMessage('items must be a non-empty list'),
  body('items.*.productId').isUUID().withMessage('Each item needs a valid productId'),
  body('items.*.quantity').isInt({ min: 1, max: 1000 }).withMessage('Quantity must be a whole number from 1 to 1000'),
  body('customer_name').isString().trim().notEmpty().withMessage('Your name is required').isLength({ max: 120 }),
  body('customer_phone').isString().trim().matches(PHONE_REGEX).withMessage('A valid phone number is required'),
  body('customer_email').optional({ values: 'falsy' }).isEmail().withMessage('Email is invalid').isLength({ max: 160 }),
  body('fulfilment_type').optional().isIn(['delivery', 'collection']).withMessage('fulfilment_type must be delivery or collection'),
  body('payment_method').optional({ values: 'falsy' }).isIn(CUSTOMER_PAYMENT_METHODS)
    .withMessage(`payment_method must be one of: ${CUSTOMER_PAYMENT_METHODS.join(', ')}`),
  requiredForDelivery('delivery_recipient_name', 120),
  body('delivery_phone').if(isDelivery).isString().trim().matches(PHONE_REGEX).withMessage('A valid delivery phone is required'),
  body('delivery_email').optional({ values: 'falsy' }).isEmail().withMessage('Delivery email is invalid').isLength({ max: 160 }),
  requiredForDelivery('delivery_district', 80),
  requiredForDelivery('delivery_sector', 80),
  requiredForDelivery('delivery_cell', 80),
  requiredForDelivery('delivery_village', 80),
  requiredForDelivery('delivery_landmark', 500),
  text('delivery_preferred_time', 120, 'preferred time'),
  text('delivery_province', 80, 'province'),
  body('delivery_location_code').optional({ values: 'falsy' }).isString().matches(/^RW-V-\d{5}$/i).withMessage('Choose your village from the list'),
  text('delivery_address', 200, 'street address'),
  text('notes', 1000),
  body('idempotencyKey').optional({ values: 'falsy' }).isUUID().withMessage('idempotencyKey must be a UUID'),
  // Guard rails: these must never come from the client.
  body(['pin', 'password', 'card_number', 'cvv']).not().exists().withMessage('Never send PINs, passwords or card details'),
];

const orderNumberParam = param('orderNumber').isString().trim().matches(/^UBH-\d{4}-\d{4,}$/i).withMessage('Invalid order number');
const idParam = param('id').isUUID().withMessage('Invalid order id');

// ---------- Public ----------
router.post('/orders', rateLimitCheckout, validate(orderBodyRules), orderController.create);
router.get('/orders/track/:orderNumber', rateLimitPublicLookup, validate([orderNumberParam]), orderController.track);
router.get('/orders/:orderNumber', rateLimitPublicLookup, validate([orderNumberParam]), orderController.track);

// ---------- Admin ----------
const admin = [authMiddleware, requireRole(ROLE_GROUPS.ORDERS), auditContext];

router.get(
  '/admin/orders',
  ...admin,
  validate([
    query('status').optional().isIn(ALL_FULFILMENT_STATUSES),
    query('paymentStatus').optional().isIn(ALL_PAYMENT_STATUSES),
    query('source').optional().isIn(ALL_ORDER_SOURCES),
    query('fulfilmentType').optional().isIn(['delivery', 'collection']),
    query('from').optional().isISO8601().withMessage('from must be a date (YYYY-MM-DD)'),
    query('to').optional().isISO8601().withMessage('to must be a date (YYYY-MM-DD)'),
    query('q').optional().isString().isLength({ max: 100 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  orderController.list,
);

router.get('/admin/orders/:id', ...admin, validate([idParam]), orderController.getById);

router.post(
  '/admin/orders',
  ...admin,
  validate([
    ...orderBodyRules,
    body('source').isIn(MANUAL_ORDER_SOURCES).withMessage(`source must be one of: ${MANUAL_ORDER_SOURCES.join(', ')}`),
    body('entry_note').isString().trim().notEmpty().withMessage('entry_note is required for manual orders').isLength({ max: 1000 }),
  ]),
  orderController.createManual,
);

router.patch(
  '/admin/orders/:id/status',
  ...admin,
  validate([
    idParam,
    body('status').isIn(ALL_FULFILMENT_STATUSES).withMessage('Invalid status'),
    body('note').optional({ values: 'null' }).isString().isLength({ max: 500 }),
  ]),
  orderController.updateStatus,
);

router.post(
  '/admin/orders/:id/cancel',
  ...admin,
  validate([
    idParam,
    body('reason').isString().trim().notEmpty().withMessage('A cancellation reason is required').isLength({ max: 500 }),
  ]),
  orderController.cancel,
);

export default router;
