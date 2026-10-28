import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller.js';
import { rateLimitWebhook } from '../middleware/rateLimit.middleware.js';

const router = Router();

// POST /api/webhooks/payment — authenticated by HMAC signature (see gateway.service.js),
// so no JWT. app.js keeps the raw body in req.rawBody for the signature check.
router.post('/webhooks/payment', rateLimitWebhook, webhookController.paymentWebhook);

export default router;
