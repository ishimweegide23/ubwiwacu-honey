import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clientIp } from '../middleware/audit.middleware.js';
import { rateLimitPaymentRef, rateLimitPublicLookup } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { PHONE_REGEX } from './order.routes.js';
import * as paymentService from '../services/payment.service.js';
import { providerName, pushEnabled } from '../services/momo.service.js';

// Mobile money "push": the customer approves the payment on their own phone (USSD prompt + PIN).
const router = Router();
const orderNumberParam = param('orderNumber').isString().trim().matches(/^UBH-\d{4}-\d{4,}$/i).withMessage('Invalid order number');
const noSecrets = body(['pin', 'password', 'card_number', 'cvv']).not().exists().withMessage('Never send PINs, passwords or card details');

// GET /api/payments/mobile/config  → is paying from the phone available?
router.get('/payments/mobile/config', (req, res) => {
  res.json({ success: true, data: { enabled: pushEnabled(), provider: providerName(), sandbox: providerName() === 'mock' } });
});

// POST /api/orders/:orderNumber/pay/mobile  { network, payer_phone, phone }
router.post(
  '/orders/:orderNumber/pay/mobile',
  rateLimitPaymentRef,
  validate([
    orderNumberParam,
    body('network').isIn(['mtn_momo', 'airtel']).withMessage('Choose MTN MoMo or Airtel Money'),
    body('payer_phone').isString().trim().matches(PHONE_REGEX).withMessage('Enter your mobile money number'),
    body('phone').isString().trim().matches(PHONE_REGEX).withMessage('Enter the phone number used when placing the order'),
    noSecrets,
  ]),
  asyncHandler(async (req, res) => {
    const data = await paymentService.initiateMobilePayment(req.params.orderNumber, req.body, { ip: clientIp(req) });
    res.status(202).json({ success: true, data, message: 'Check your phone and approve the payment with your PIN' });
  }),
);

// GET /api/orders/:orderNumber/pay/mobile/:paymentId?phone=  → pending | paid | failed
router.get(
  '/orders/:orderNumber/pay/mobile/:paymentId',
  rateLimitPublicLookup,
  validate([orderNumberParam, param('paymentId').isUUID(), query('phone').isString().trim().matches(PHONE_REGEX)]),
  asyncHandler(async (req, res) => {
    const data = await paymentService.getMobilePaymentStatus(req.params.orderNumber, req.params.paymentId, req.query.phone);
    res.json({ success: true, data });
  }),
);

// POST /api/webhooks/momo  — provider callback. Never trusted: it only triggers a status check.
router.post(
  '/webhooks/momo',
  asyncHandler(async (req, res) => {
    const data = await paymentService.handleMomoCallback(req.body, clientIp(req));
    res.json({ success: true, data });
  }),
);

export default router;
