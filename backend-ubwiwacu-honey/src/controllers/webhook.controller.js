import { asyncHandler } from '../utils/asyncHandler.js';
import { clientIp } from '../middleware/audit.middleware.js';
import { SIGNATURE_HEADER } from '../services/gateway.service.js';
import * as paymentService from '../services/payment.service.js';

export const paymentWebhook = asyncHandler(async (req, res) => {
  const data = await paymentService.handleGatewayWebhook(req.rawBody, req.get(SIGNATURE_HEADER), clientIp(req));
  res.json({ success: true, data });
});
