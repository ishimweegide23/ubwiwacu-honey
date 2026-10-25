import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Payment gateway adapter — STUB.
 * No real provider is integrated yet. When one is chosen, adapt `parseEvent`
 * to that provider's payload and signature scheme. We never receive or store
 * PINs, passwords or card data: the provider handles authorisation on its side.
 *
 * Expected stub payload (JSON):
 * {
 *   "provider_reference": "GW-123456",     // unique id from the provider (idempotency key)
 *   "order_number": "UBH-2026-0001",
 *   "status": "paid" | "failed",
 *   "amount_rwf": 9000,
 *   "transaction_ref": "MP240101.1234.A12345"  // optional
 * }
 * Header: X-Gateway-Signature: hex(HMAC_SHA256(rawBody, GATEWAY_WEBHOOK_SECRET))
 */

export const SIGNATURE_HEADER = 'x-gateway-signature';

export function isGatewayEnabled() {
  return env.GATEWAY_ENABLED && Boolean(env.GATEWAY_WEBHOOK_SECRET);
}

export function computeSignature(rawBody) {
  return crypto.createHmac('sha256', env.GATEWAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

/** Constant-time signature check. */
export function verifySignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = Buffer.from(computeSignature(rawBody), 'hex');
  let given;
  try {
    given = Buffer.from(String(signature).replace(/^sha256=/, ''), 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const PAID_STATUSES = ['paid', 'success', 'successful', 'completed'];

/** Verify + normalise an incoming webhook. Throws ApiError on any problem. */
export function parseEvent(rawBody, signature) {
  if (!isGatewayEnabled()) {
    throw new ApiError(503, 'Payment gateway is not enabled');
  }
  if (!verifySignature(rawBody, signature)) {
    throw ApiError.unauthorized('Invalid webhook signature');
  }
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Webhook body is not valid JSON');
  }

  const providerReference = String(payload.provider_reference ?? '').trim();
  const orderNumber = String(payload.order_number ?? '').trim().toUpperCase();
  const amount = Number(payload.amount_rwf);
  if (!providerReference || !orderNumber || !Number.isInteger(amount) || amount <= 0) {
    throw ApiError.badRequest('Webhook is missing provider_reference, order_number or amount_rwf');
  }

  return {
    providerReference: providerReference.slice(0, 160),
    orderNumber,
    amount,
    paid: PAID_STATUSES.includes(String(payload.status ?? '').toLowerCase()),
    transactionRef: payload.transaction_ref ? String(payload.transaction_ref).slice(0, 120) : null,
    rawStatus: String(payload.status ?? ''),
  };
}
