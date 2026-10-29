import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import {
  AUDIT_ACTIONS,
  CLOSED_FULFILMENT,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  PRE_PAYMENT_FULFILMENT,
} from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { paginationMeta, phonesMatch } from '../utils/helpers.js';
import { recordAudit } from '../middleware/audit.middleware.js';
import { getAdminOrder, getPublicOrderByNumber, lockOrderById, lockOrderByNumber } from './order.service.js';
import * as receiptService from './receipt.service.js';
import * as gatewayService from './gateway.service.js';
import * as momoService from './momo.service.js';

// ============================================================================
// Helpers
// ============================================================================

async function findPaidPayment(client, orderId) {
  const { rows } = await client.query(`SELECT * FROM payments WHERE order_id = $1 AND status = 'paid'`, [orderId]);
  return rows[0] || null;
}

/** The same transaction reference must never confirm two payments. */
async function assertReferenceUnused(client, ref, excludePaymentId = null) {
  if (!ref) return;
  const { rows } = await client.query(
    `SELECT p.id, o.order_number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE lower(p.transaction_ref) = lower($1)
        AND p.status IN ('verification', 'paid')
        AND ($2::uuid IS NULL OR p.id <> $2)
      LIMIT 1`,
    [ref, excludePaymentId],
  );
  if (rows[0]) {
    throw ApiError.conflict('This transaction reference has already been submitted for another payment');
  }
}

/**
 * Mark a payment PAID and update the order (must hold the order lock).
 * Then issue the receipt in the same transaction.
 */
async function markPaidLocked(client, order, paymentId, { transactionRef, method, verifiedBy, providerReference, actor, action, note }) {
  const { rows } = await client.query(
    `UPDATE payments
        SET status = 'paid',
            amount_rwf = $2,
            method = COALESCE($3, method),
            transaction_ref = COALESCE($4, transaction_ref),
            provider_reference = COALESCE($5, provider_reference),
            verified_by = $6,
            verified_at = now(),
            rejection_reason = NULL,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [paymentId, order.total_rwf, method || null, transactionRef || null, providerReference || null, verifiedBy || null],
  );
  const payment = rows[0];

  // Any other open attempts for this order are superseded.
  await client.query(
    `UPDATE payments SET status = 'rejected', rejection_reason = 'Superseded by verified payment', updated_at = now()
      WHERE order_id = $1 AND id <> $2 AND status IN ('pending','verification')`,
    [order.id, paymentId],
  );

  const nextFulfilment = PRE_PAYMENT_FULFILMENT.includes(order.fulfilment_status) ? 'paid' : order.fulfilment_status;
  await client.query(
    `UPDATE orders
        SET payment_status = 'paid', amount_paid_rwf = total_rwf, balance_rwf = 0,
            fulfilment_status = $2, updated_at = now()
      WHERE id = $1`,
    [order.id, nextFulfilment],
  );

  await recordAudit(client, {
    actor,
    action,
    recordType: 'payment',
    recordId: payment.id,
    details: {
      order_id: order.id,
      order_number: order.order_number,
      amount_rwf: payment.amount_rwf,
      method: payment.method,
      transaction_ref: payment.transaction_ref,
      provider_reference: payment.provider_reference,
      note: note || null,
    },
  });

  const { receipt } = await receiptService.issueReceiptForPayment(client, payment.id, actor);
  return { payment, receipt };
}

// ============================================================================
// Customer: submit transaction reference  (never sets Paid)
// ============================================================================

export async function submitPaymentReference(orderNumber, { transaction_ref, method, phone }, actor) {
  await withTransaction(async (client) => {
    const order = await lockOrderByNumber(client, orderNumber).catch((err) => {
      if (err instanceof ApiError && err.statusCode === 404) return null;
      throw err;
    });
    if (!order || !phonesMatch(order.customer_phone, phone)) {
      throw ApiError.notFound('No order found for this order number and phone number');
    }
    if (CLOSED_FULFILMENT.includes(order.fulfilment_status)) {
      throw ApiError.conflict(`This order is ${order.fulfilment_status}`);
    }
    if (order.payment_status === PAYMENT_STATUS.PAID || order.payment_status === PAYMENT_STATUS.REFUNDED) {
      throw ApiError.conflict('Payment for this order has already been confirmed');
    }
    if (order.payment_status === PAYMENT_STATUS.VERIFICATION) {
      throw ApiError.conflict('A payment reference is already being verified for this order. We will update you shortly.');
    }

    await assertReferenceUnused(client, transaction_ref);

    const pending = await client.query(
      `SELECT id FROM payments WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [order.id],
    );
    let paymentId;
    if (pending.rows[0]) {
      paymentId = pending.rows[0].id;
      await client.query(
        `UPDATE payments SET status = 'verification', channel = 'reference', method = $2, transaction_ref = $3, amount_rwf = $4, updated_at = now()
          WHERE id = $1`,
        [paymentId, method, transaction_ref, order.total_rwf],
      );
    } else {
      const ins = await client.query(
        `INSERT INTO payments (order_id, amount_rwf, method, status, transaction_ref)
         VALUES ($1, $2, $3, 'verification', $4) RETURNING id`,
        [order.id, order.total_rwf, method, transaction_ref],
      );
      paymentId = ins.rows[0].id;
    }

    const nextFulfilment = PRE_PAYMENT_FULFILMENT.includes(order.fulfilment_status)
      ? 'payment_verification'
      : order.fulfilment_status;
    await client.query(
      `UPDATE orders SET payment_status = 'verification', fulfilment_status = $2, updated_at = now() WHERE id = $1`,
      [order.id, nextFulfilment],
    );

    await recordAudit(client, {
      actor: { userId: null, ip: actor?.ip },
      action: AUDIT_ACTIONS.PAYMENT_SUBMIT_REF,
      recordType: 'payment',
      recordId: paymentId,
      details: { order_number: order.order_number, method, transaction_ref },
    });
  });

  return getPublicOrderByNumber(orderNumber);
}

// ============================================================================
// Admin: verify / reject
// ============================================================================

export async function verifyPayment(orderId, { payment_id, transaction_ref, method, note }, actor) {
  const result = await withTransaction(async (client) => {
    const order = await lockOrderById(client, orderId);
    if (CLOSED_FULFILMENT.includes(order.fulfilment_status)) {
      throw ApiError.conflict(`Cannot verify payment: order is ${order.fulfilment_status}`);
    }
    if (await findPaidPayment(client, order.id)) {
      throw ApiError.conflict('This order already has a verified payment');
    }

    let payment;
    if (payment_id) {
      const r = await client.query('SELECT * FROM payments WHERE id = $1 AND order_id = $2', [payment_id, order.id]);
      payment = r.rows[0];
      if (!payment) throw ApiError.notFound('Payment not found for this order');
      if (!['pending', 'verification', 'rejected'].includes(payment.status)) {
        throw ApiError.conflict(`Payment is ${payment.status} and cannot be verified`);
      }
    } else {
      const r = await client.query(
        `SELECT * FROM payments WHERE order_id = $1 AND status IN ('verification','pending')
          ORDER BY (status = 'verification') DESC, created_at DESC LIMIT 1`,
        [order.id],
      );
      payment = r.rows[0];
    }

    const finalMethod = method || payment?.method;
    if (!finalMethod) {
      throw ApiError.unprocessable('No payment on record for this order. Provide "method" (and "transaction_ref" unless cash).');
    }
    if (finalMethod === PAYMENT_METHODS.GATEWAY) {
      throw ApiError.unprocessable('Gateway payments are confirmed by the gateway webhook only');
    }
    const finalRef = transaction_ref || payment?.transaction_ref || null;
    if (finalMethod !== PAYMENT_METHODS.CASH && !finalRef) {
      throw ApiError.unprocessable('transaction_ref is required to verify a non-cash payment');
    }

    if (!payment) {
      const ins = await client.query(
        `INSERT INTO payments (order_id, amount_rwf, method, status, transaction_ref)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
        [order.id, order.total_rwf, finalMethod, finalRef],
      );
      payment = ins.rows[0];
    }
    await assertReferenceUnused(client, finalRef, payment.id);

    const { receipt } = await markPaidLocked(client, order, payment.id, {
      transactionRef: finalRef,
      method: finalMethod,
      verifiedBy: actor?.userId,
      actor,
      action: AUDIT_ACTIONS.PAYMENT_VERIFY,
      note,
    });
    return { receiptId: receipt.id };
  });

  receiptService.deliverReceiptInBackground(result.receiptId);
  const order = await getAdminOrder(orderId);
  return { order, receipt: order.receipts.find((r) => r.id === result.receiptId) || null };
}

export async function rejectPayment(orderId, { payment_id, rejection_reason }, actor) {
  await withTransaction(async (client) => {
    const order = await lockOrderById(client, orderId);
    if (order.payment_status === PAYMENT_STATUS.PAID) {
      throw ApiError.conflict('This payment is already verified. Use a refund instead.');
    }
    const r = payment_id
      ? await client.query('SELECT * FROM payments WHERE id = $1 AND order_id = $2', [payment_id, order.id])
      : await client.query(
          `SELECT * FROM payments WHERE order_id = $1 AND status IN ('verification','pending')
            ORDER BY (status = 'verification') DESC, created_at DESC LIMIT 1`,
          [order.id],
        );
    const payment = r.rows[0];
    if (!payment) throw ApiError.notFound('No payment awaiting verification for this order');
    if (!['pending', 'verification'].includes(payment.status)) {
      throw ApiError.conflict(`Payment is ${payment.status} and cannot be rejected`);
    }

    await client.query(
      `UPDATE payments SET status = 'rejected', rejection_reason = $2, verified_by = $3, verified_at = now(), updated_at = now()
        WHERE id = $1`,
      [payment.id, rejection_reason, actor?.userId ?? null],
    );
    const nextFulfilment = PRE_PAYMENT_FULFILMENT.includes(order.fulfilment_status)
      ? 'awaiting_payment'
      : order.fulfilment_status;
    await client.query(
      `UPDATE orders SET payment_status = 'rejected', fulfilment_status = $2, updated_at = now() WHERE id = $1`,
      [order.id, nextFulfilment],
    );
    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.PAYMENT_REJECT,
      recordType: 'payment',
      recordId: payment.id,
      details: { order_number: order.order_number, transaction_ref: payment.transaction_ref, rejection_reason },
    });
  });
  return getAdminOrder(orderId);
}

export async function listPayments(filters, { page, limit, offset }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (filters.status) add('p.status = ?', filters.status);
  if (filters.method) add('p.method = ?', filters.method);
  if (filters.from) add('p.created_at >= ?', filters.from);
  if (filters.to) add('p.created_at < ?', filters.to);
  if (filters.q) add('(p.transaction_ref ILIKE ? OR o.order_number ILIKE ? OR o.customer_name ILIKE ?)', `%${filters.q}%`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(
    `SELECT COUNT(*)::int AS total FROM payments p JOIN orders o ON o.id = p.order_id ${whereSql}`,
    params,
  );
  const dataParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT p.*, o.order_number, o.customer_name, o.customer_phone, o.total_rwf AS order_total_rwf,
            o.source, u.name AS verified_by_name
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       LEFT JOIN users u ON u.id = p.verified_by
       ${whereSql}
      ORDER BY (p.status = 'verification') DESC, p.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );
  return { items: rows, pagination: paginationMeta(page, limit, count.rows[0].total) };
}

// ============================================================================
// Gateway webhook (stub provider)
// ============================================================================

export async function handleGatewayWebhook(rawBody, signature, ip) {
  const event = gatewayService.parseEvent(rawBody, signature);
  const actor = { userId: null, ip };

  const outcome = await withTransaction(async (client) => {
    // Idempotency: the provider may retry the same event.
    const existing = await client.query('SELECT * FROM payments WHERE provider_reference = $1 LIMIT 1', [
      event.providerReference,
    ]);
    if (existing.rows[0]?.status === PAYMENT_STATUS.PAID) {
      return { status: 'already_processed' };
    }

    const order = await lockOrderByNumber(client, event.orderNumber);

    if (!event.paid) {
      if (existing.rows[0]) {
        await client.query(
          `UPDATE payments SET status = 'rejected', rejection_reason = $2, updated_at = now() WHERE id = $1`,
          [existing.rows[0].id, `Gateway status: ${event.rawStatus}`],
        );
      }
      await recordAudit(client, {
        actor,
        action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
        recordType: 'order',
        recordId: order.id,
        details: { provider_reference: event.providerReference, status: event.rawStatus, paid: false },
      });
      return { status: 'not_paid' };
    }

    if (await findPaidPayment(client, order.id)) {
      return { status: 'order_already_paid' };
    }
    if (CLOSED_FULFILMENT.includes(order.fulfilment_status)) {
      throw ApiError.conflict(`Order is ${order.fulfilment_status}`);
    }
    if (event.amount !== order.total_rwf) {
      logger.error('Gateway amount mismatch', { order: order.order_number, expected: order.total_rwf, got: event.amount });
      throw ApiError.conflict('Paid amount does not match the order total');
    }

    let paymentId = existing.rows[0]?.id;
    if (!paymentId) {
      const ins = await client.query(
        `INSERT INTO payments (order_id, amount_rwf, method, status, provider_reference, transaction_ref)
         VALUES ($1, $2, 'gateway', 'pending', $3, $4) RETURNING id`,
        [order.id, order.total_rwf, event.providerReference, event.transactionRef],
      );
      paymentId = ins.rows[0].id;
    }

    const { receipt } = await markPaidLocked(client, order, paymentId, {
      transactionRef: event.transactionRef,
      method: PAYMENT_METHODS.GATEWAY,
      verifiedBy: null,
      providerReference: event.providerReference,
      actor,
      action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
      note: 'Verified by gateway webhook',
    });
    return { status: 'paid', receiptId: receipt.id };
  });

  if (outcome.receiptId) receiptService.deliverReceiptInBackground(outcome.receiptId);
  return { status: outcome.status };
}

// ============================================================================
// Mobile money push (USSD prompt on the customer's phone)
// ============================================================================

/**
 * Customer asks to pay from their phone. We create a pending "push" payment and ask the
 * provider to prompt the payer. The order phone must match (same rule as the reference flow).
 */
export async function initiateMobilePayment(orderNumber, { network, payer_phone, phone }, actor) {
  if (!momoService.pushEnabled()) {
    throw new ApiError(503, 'Paying from your phone is not available yet. Please pay and send your transaction reference.');
  }
  const msisdn = momoService.normaliseMsisdn(payer_phone);
  if (!msisdn) {
    throw ApiError.unprocessable('Enter a Rwandan mobile money number, e.g. 0788 123 456', [
      { field: 'payer_phone', message: 'Enter a Rwandan mobile money number, e.g. 0788 123 456' },
    ]);
  }
  const detected = momoService.networkOf(msisdn);
  if (detected && detected !== network) {
    const label = detected === 'mtn_momo' ? 'MTN' : 'Airtel';
    throw ApiError.unprocessable(`This looks like an ${label} number. Choose ${label} or use another number.`, [
      { field: 'payer_phone', message: `This looks like an ${label} number` },
    ]);
  }

  const ref = crypto.randomUUID();
  const created = await withTransaction(async (client) => {
    const order = await lockOrderByNumber(client, orderNumber).catch((err) => {
      if (err instanceof ApiError && err.statusCode === 404) return null;
      throw err;
    });
    if (!order || !phonesMatch(order.customer_phone, phone)) {
      throw ApiError.notFound('No order found for this order number and phone number');
    }
    if (CLOSED_FULFILMENT.includes(order.fulfilment_status)) throw ApiError.conflict(`This order is ${order.fulfilment_status}`);
    if ([PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(order.payment_status)) {
      throw ApiError.conflict('Payment for this order has already been confirmed');
    }
    if (order.payment_status === PAYMENT_STATUS.VERIFICATION) {
      throw ApiError.conflict('A payment reference is already being verified for this order.');
    }
    // One live prompt at a time per order.
    const open = await client.query(
      `SELECT id FROM payments WHERE order_id = $1 AND channel = 'push' AND status = 'pending' AND expires_at > now() LIMIT 1`,
      [order.id],
    );
    if (open.rows[0]) {
      throw ApiError.conflict('A payment request was already sent. Check your phone, or wait a minute and try again.');
    }
    const { rows } = await client.query(
      `INSERT INTO payments (order_id, amount_rwf, method, status, channel, payer_phone, provider, provider_reference, expires_at)
       VALUES ($1, $2, $3, 'pending', 'push', $4, $5, $6, now() + make_interval(mins => $7))
       RETURNING id, expires_at`,
      [order.id, order.total_rwf, network, msisdn, momoService.providerName(), ref, momoService.PUSH_TIMEOUT_MIN],
    );
    await recordAudit(client, {
      actor: { userId: null, ip: actor?.ip },
      action: AUDIT_ACTIONS.PAYMENT_PUSH_REQUEST,
      recordType: 'payment',
      recordId: rows[0].id,
      details: { order_number: order.order_number, network, payer_phone: msisdn, amount_rwf: order.total_rwf },
    });
    return { paymentId: rows[0].id, expiresAt: rows[0].expires_at, amount: order.total_rwf };
  });

  // Ask the provider outside the DB transaction (network call).
  try {
    const res = await momoService.requestPayment({ ref, msisdn, amount: created.amount, network });
    await query(`UPDATE payments SET transaction_ref = COALESCE($2, transaction_ref), provider_status = $3, updated_at = now() WHERE id = $1`, [
      created.paymentId,
      res.providerTxId,
      res.raw,
    ]);
  } catch (err) {
    await query(
      `UPDATE payments SET status = 'rejected', rejection_reason = $2, provider_status = 'request_failed', updated_at = now() WHERE id = $1`,
      [created.paymentId, String(err.message).slice(0, 300)],
    );
    throw err instanceof ApiError ? err : new ApiError(502, 'We could not reach the mobile money provider. Try again or use a reference.');
  }

  return { payment_id: created.paymentId, status: 'pending', payer_phone: msisdn, network, expires_at: created.expiresAt, amount_rwf: created.amount };
}

/** Ask the provider about one open push payment and settle it if the result is final. */
async function settlePushPayment(paymentId, actor) {
  const { rows } = await query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
  const p = rows[0];
  if (!p || p.channel !== 'push' || p.status !== 'pending') return p?.status || 'unknown';

  const result = await momoService.checkStatus({ ref: p.provider_reference, providerTxId: p.transaction_ref });
  await query(`UPDATE payments SET provider_status = $2, last_checked_at = now() WHERE id = $1`, [p.id, result.raw]);

  if (result.status === 'pending') {
    if (new Date(p.expires_at) < new Date()) {
      await query(
        `UPDATE payments SET status = 'rejected', rejection_reason = 'The payment was not approved in time', updated_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [p.id],
      );
      return 'expired';
    }
    return 'pending';
  }
  if (result.status === 'failed') {
    await query(`UPDATE payments SET status = 'rejected', rejection_reason = $2, updated_at = now() WHERE id = $1 AND status = 'pending'`, [
      p.id,
      `Not approved on the phone (${result.raw || 'declined'})`,
    ]);
    return 'failed';
  }

  // Paid: settle under the order lock (idempotent: a second caller sees it already paid).
  const outcome = await withTransaction(async (client) => {
    const order = await lockOrderById(client, p.order_id);
    const again = await client.query(`SELECT status FROM payments WHERE id = $1 FOR UPDATE`, [p.id]);
    if (again.rows[0]?.status === PAYMENT_STATUS.PAID || (await findPaidPayment(client, order.id))) return { status: 'paid' };
    const { receipt } = await markPaidLocked(client, order, p.id, {
      transactionRef: result.transactionRef || p.transaction_ref,
      method: p.method,
      verifiedBy: null,
      providerReference: p.provider_reference,
      actor: actor || { userId: null, ip: null },
      action: AUDIT_ACTIONS.PAYMENT_WEBHOOK,
      note: `Confirmed by mobile money provider (${p.provider})`,
    });
    return { status: 'paid', receiptId: receipt.id };
  });
  if (outcome.receiptId) receiptService.deliverReceiptInBackground(outcome.receiptId);
  return 'paid';
}

/** Customer's page polls this every few seconds while waiting for the phone prompt. */
export async function getMobilePaymentStatus(orderNumber, paymentId, phone) {
  const { rows } = await query(
    `SELECT p.id, p.status, p.rejection_reason, p.last_checked_at, p.expires_at, p.channel, o.customer_phone
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.id = $1 AND upper(o.order_number) = upper($2)`,
    [paymentId, orderNumber],
  );
  const p = rows[0];
  if (!p || p.channel !== 'push' || !phonesMatch(p.customer_phone, phone)) throw ApiError.notFound('Payment request not found');
  let status = p.status === 'pending' ? 'pending' : p.status === 'paid' ? 'paid' : 'failed';
  // Ask the provider at most every 3 seconds per payment.
  if (status === 'pending' && (!p.last_checked_at || Date.now() - new Date(p.last_checked_at).getTime() > 3000)) {
    const r = await settlePushPayment(p.id);
    status = r === 'paid' ? 'paid' : r === 'pending' ? 'pending' : 'failed';
  }
  let reason = null;
  if (status === 'failed') {
    const again = await query(`SELECT rejection_reason FROM payments WHERE id = $1`, [p.id]);
    reason = again.rows[0]?.rejection_reason || 'The payment was not completed.';
  }
  return { status, reason, expires_at: p.expires_at };
}

/** Provider callback: the body is never trusted, it only tells us which payment to re-check. */
export async function handleMomoCallback(body, ip) {
  const payload = body?.jsonpayload || body || {};
  const ref = String(payload.requesttransactionid || payload.request_transaction_id || payload.external_id || '').trim();
  if (!ref) return { status: 'ignored' };
  const { rows } = await query(`SELECT id FROM payments WHERE provider_reference = $1`, [ref]);
  if (!rows[0]) return { status: 'unknown_reference' };
  const status = await settlePushPayment(rows[0].id, { userId: null, ip });
  return { status };
}

/** Background safety net: re-check open push payments (callbacks can be late or lost). */
export function startPushPoller(intervalMs = 15_000) {
  if (!momoService.pushEnabled()) return null;
  const timer = setInterval(async () => {
    try {
      const { rows } = await query(
        `SELECT id FROM payments WHERE channel = 'push' AND status = 'pending'
            AND (last_checked_at IS NULL OR last_checked_at < now() - interval '10 seconds')
          ORDER BY created_at LIMIT 20`,
      );
      for (const r of rows) await settlePushPayment(r.id);
    } catch (err) {
      logger.warn(`Push payment poller: ${err.message}`);
    }
  }, intervalMs);
  timer.unref();
  logger.info(`Mobile money push payments on (provider: ${momoService.providerName()})`);
  return timer;
}
