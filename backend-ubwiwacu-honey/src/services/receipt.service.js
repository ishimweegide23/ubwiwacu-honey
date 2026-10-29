import fs from 'node:fs';
import path from 'node:path';
import { env, ROOT_DIR } from '../config/env.js';
import { getNextCounter, query } from '../config/db.js';
import {
  AUDIT_ACTIONS,
  COUNTERS,
  DELIVERY_NOTICE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  RECEIPT_DELIVERY_STATUS,
} from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { buildReceiptNumber } from '../utils/receiptNumber.js';
import { writeReceiptPdf } from '../utils/pdf.js';
import { escapeHtml, formatDateTime, formatRWF, paginationMeta, phonesMatch, renderTemplate } from '../utils/helpers.js';
import { normalizeOrderNumber } from '../utils/orderNumber.js';
import { recordAudit } from '../middleware/audit.middleware.js';
import * as emailService from './email.service.js';

fs.mkdirSync(env.RECEIPT_STORAGE, { recursive: true });

/** DB stores a path relative to the project root; resolve it inside RECEIPT_STORAGE only. */
function absoluteReceiptPath(filePath, receiptNumber) {
  const name = filePath ? path.basename(filePath) : `${receiptNumber}.pdf`;
  return path.join(env.RECEIPT_STORAGE, name);
}

function relativeReceiptPath(receiptNumber) {
  return path.relative(ROOT_DIR, path.join(env.RECEIPT_STORAGE, `${receiptNumber}.pdf`)).split(path.sep).join('/');
}

/**
 * Everything needed to render a receipt, read from receipts/payments/orders/order_items.
 */
async function loadReceiptView(executor, receiptId) {
  const run = executor ? executor.query.bind(executor) : query;
  const { rows } = await run(
    `SELECT r.*, p.method AS payment_method, p.transaction_ref, p.provider_reference, p.status AS payment_status,
            p.verified_at, o.order_number, o.customer_name, o.customer_phone, o.customer_email,
            o.delivery_email, o.subtotal_rwf, o.discount_rwf, o.total_rwf, o.balance_rwf,
            o.created_at AS order_created_at, o.source, o.payment_status AS order_payment_status
       FROM receipts r
       JOIN payments p ON p.id = r.payment_id
       JOIN orders o   ON o.id = r.order_id
      WHERE r.id = $1`,
    [receiptId],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound('Receipt not found');
  const items = await run(
    `SELECT product_name, package_size, unit_price_rwf, quantity, line_total_rwf
       FROM order_items WHERE order_id = $1 ORDER BY created_at, product_name`,
    [r.order_id],
  );
  return {
    ...r,
    items: items.rows,
    payment_method_label: PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method,
    absolute_path: absoluteReceiptPath(r.file_path, r.receipt_number),
    delivery_notice: DELIVERY_NOTICE,
    business: {
      name: env.BUSINESS_NAME,
      parent: env.BUSINESS_PARENT,
      email: env.BUSINESS_EMAIL,
      phone: env.BUSINESS_PHONE,
    },
  };
}

function toReceiptDto(view) {
  const { absolute_path: _abs, business: _b, ...rest } = view;
  return {
    ...rest,
    amount_display: formatRWF(view.amount_rwf),
    pdf_available: fs.existsSync(view.absolute_path),
  };
}

/**
 * Make sure the PDF exists. It is re-rendered when missing, or when a correction
 * (refund / void note) was added after the file was written.
 */
async function ensurePdf(view) {
  let stale = true;
  try {
    const stat = fs.statSync(view.absolute_path);
    stale = Boolean(view.correction_ref) && stat.mtime < new Date(view.updated_at);
  } catch {
    stale = true;
  }
  if (stale) await writeReceiptPdf(view, view.absolute_path);
  return view.absolute_path;
}

// ============================================================================
// Issue (called inside the payment verify / POS transaction)
// ============================================================================

/**
 * Create the receipt for a PAID payment. Idempotent: if the payment already has
 * a receipt it is returned unchanged (UNIQUE index on receipts.payment_id backs this up).
 * Must be called with a transaction client after payment.status = 'paid'.
 * @returns {{ receipt: object, created: boolean }}
 */
export async function issueReceiptForPayment(client, paymentId, actor) {
  const existing = await client.query('SELECT * FROM receipts WHERE payment_id = $1', [paymentId]);
  if (existing.rows[0]) return { receipt: existing.rows[0], created: false };

  const pay = await client.query('SELECT id, order_id, amount_rwf, status FROM payments WHERE id = $1', [paymentId]);
  const payment = pay.rows[0];
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('A receipt can only be issued for a verified (paid) payment');
  }

  const seq = await getNextCounter(client, COUNTERS.RECEIPT);
  const receiptNumber = buildReceiptNumber(seq);

  const inserted = await client.query(
    `INSERT INTO receipts (receipt_number, order_id, payment_id, amount_rwf, file_path, delivery_status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (payment_id) DO NOTHING
     RETURNING *`,
    [receiptNumber, payment.order_id, payment.id, payment.amount_rwf, relativeReceiptPath(receiptNumber)],
  );
  if (!inserted.rows[0]) {
    const again = await client.query('SELECT * FROM receipts WHERE payment_id = $1', [paymentId]);
    return { receipt: again.rows[0], created: false };
  }
  const receipt = inserted.rows[0];

  const view = await loadReceiptView(client, receipt.id);
  await writeReceiptPdf(view, view.absolute_path);

  await recordAudit(client, {
    actor,
    action: AUDIT_ACTIONS.RECEIPT_ISSUE,
    recordType: 'receipt',
    recordId: receipt.id,
    details: { receipt_number: receiptNumber, order_id: payment.order_id, payment_id: payment.id, amount_rwf: payment.amount_rwf },
  });

  return { receipt, created: true };
}

// ============================================================================
// Delivery (email) — always AFTER the transaction commits
// ============================================================================

/**
 * Email the receipt. Never throws: the receipt record is kept and its
 * delivery_status says what happened, so it can be retried / resent.
 */
export async function deliverReceipt(receiptId, { overrideEmail = null } = {}) {
  const view = await loadReceiptView(null, receiptId);
  const to = overrideEmail || view.customer_email || view.delivery_email;

  if (!to) {
    await query(
      `UPDATE receipts SET delivery_error = $2, updated_at = now() WHERE id = $1`,
      [receiptId, 'No email address on the order'],
    );
    return { status: view.delivery_status, sent: false, reason: 'No email address on the order' };
  }

  try {
    await ensurePdf(view);
    await emailService.sendReceiptEmail({ ...view, file_path: view.absolute_path }, to);
    await query(
      `UPDATE receipts SET delivery_status = 'sent', delivery_error = NULL, updated_at = now() WHERE id = $1`,
      [receiptId],
    );
    return { status: RECEIPT_DELIVERY_STATUS.SENT, sent: true, to };
  } catch (err) {
    logger.warn('Receipt email failed', { receipt: view.receipt_number, error: err.message });
    await query(
      `UPDATE receipts SET delivery_status = 'failed', delivery_error = $2, updated_at = now() WHERE id = $1`,
      [receiptId, String(err.message).slice(0, 500)],
    );
    return { status: RECEIPT_DELIVERY_STATUS.FAILED, sent: false, reason: err.message };
  }
}

/** Fire-and-forget wrapper used right after verification / POS sale. */
export function deliverReceiptInBackground(receiptId) {
  deliverReceipt(receiptId).catch((err) =>
    logger.error('Unexpected error delivering receipt', { receiptId, error: err.message }),
  );
}

/** Retry every failed receipt email (called on a timer from server.js and by admin). */
export async function retryFailedReceipts({ olderThanMinutes = 5, limit = 50 } = {}) {
  if (!emailService.isEmailConfigured()) return { attempted: 0, sent: 0, skipped: 'Email not configured' };
  const { rows } = await query(
    `SELECT id FROM receipts
      WHERE delivery_status = 'failed' AND updated_at < now() - make_interval(mins => $1)
      ORDER BY updated_at ASC LIMIT $2`,
    [olderThanMinutes, limit],
  );
  let sent = 0;
  for (const r of rows) {
    const result = await deliverReceipt(r.id);
    if (result.sent) sent += 1;
  }
  if (rows.length) logger.info('Receipt retry finished', { attempted: rows.length, sent });
  return { attempted: rows.length, sent };
}

// ============================================================================
// Admin
// ============================================================================

export async function listReceipts(filters, { page, limit, offset }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (filters.deliveryStatus) add('r.delivery_status = ?', filters.deliveryStatus);
  if (filters.from) add('r.issued_at >= ?', filters.from);
  if (filters.to) add('r.issued_at < ?', filters.to);
  if (filters.q) {
    add('(r.receipt_number ILIKE ? OR o.order_number ILIKE ? OR o.customer_name ILIKE ? OR o.customer_phone ILIKE ?)', `%${filters.q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(
    `SELECT COUNT(*)::int AS total FROM receipts r JOIN orders o ON o.id = r.order_id ${whereSql}`,
    params,
  );
  const dataParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT r.id, r.receipt_number, r.order_id, r.payment_id, r.amount_rwf, r.delivery_status,
            r.delivery_error, r.correction_ref, r.issued_at, r.updated_at,
            o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.source,
            p.method AS payment_method, p.transaction_ref, p.status AS payment_status
       FROM receipts r
       JOIN orders o ON o.id = r.order_id
       JOIN payments p ON p.id = r.payment_id
       ${whereSql}
      ORDER BY r.issued_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );
  return { items: rows, pagination: paginationMeta(page, limit, count.rows[0].total) };
}

export async function getReceipt(receiptId) {
  return toReceiptDto(await loadReceiptView(null, receiptId));
}

export async function getReceiptPdf(receiptId) {
  const view = await loadReceiptView(null, receiptId);
  const filePath = await ensurePdf(view);
  return { filePath, filename: `${view.receipt_number}.pdf` };
}

export async function renderReceiptHtml(receiptId) {
  const v = await loadReceiptView(null, receiptId);
  const rows = v.items
    .map(
      (i) => `<tr><td>${escapeHtml(i.product_name)}</td><td>${escapeHtml(i.package_size)}</td>
<td class="num">${Number(i.quantity)}</td><td class="num">${escapeHtml(formatRWF(i.unit_price_rwf))}</td>
<td class="num">${escapeHtml(formatRWF(i.line_total_rwf))}</td></tr>`,
    )
    .join('\n');
  return renderTemplate('receipt.html', {
    business_name: v.business.name,
    business_parent: v.business.parent,
    business_phone: v.business.phone,
    business_email: v.business.email,
    receipt_number: v.receipt_number,
    issued_at: formatDateTime(v.issued_at),
    customer_name: v.customer_name,
    customer_phone: v.customer_phone,
    customer_email: v.customer_email || '-',
    order_number: v.order_number,
    payment_method: v.payment_method_label,
    transaction_ref: v.transaction_ref || '-',
    payment_status: v.payment_status,
    item_rows: rows,
    subtotal: formatRWF(v.subtotal_rwf),
    discount: formatRWF(v.discount_rwf),
    total_paid: formatRWF(v.amount_rwf),
    balance: formatRWF(v.balance_rwf),
    correction_block: v.correction_ref
      ? `<div class="correction"><strong>Correction:</strong> ${escapeHtml(v.correction_ref)}</div>`
      : '',
    delivery_notice: v.delivery_notice,
  });
}

export async function resendReceipt(receiptId, { email }, actor) {
  const view = await loadReceiptView(null, receiptId);
  if (!email && !view.customer_email && !view.delivery_email) {
    throw ApiError.unprocessable('This order has no email address. Provide "email" to send the receipt to.');
  }
  const result = await deliverReceipt(receiptId, { overrideEmail: email || null });
  await recordAudit(null, {
    actor,
    action: AUDIT_ACTIONS.RECEIPT_RESEND,
    recordType: 'receipt',
    recordId: receiptId,
    details: { receipt_number: view.receipt_number, to: result.to || email || null, sent: result.sent, reason: result.reason || null },
  });
  if (!result.sent) {
    throw ApiError.badRequest(`Receipt could not be sent: ${result.reason}`);
  }
  return { ...(await getReceipt(receiptId)), sent_to: result.to };
}

// ============================================================================
// Public (customer download)
// ============================================================================

/**
 * Customer receipt download. Order numbers are sequential, so the customer must also
 * give the phone number used on the order.
 */
export async function getPublicReceiptPdf(orderNumber, phone) {
  const { rows } = await query(
    `SELECT o.id, o.order_number, o.customer_phone, o.payment_status
       FROM orders o WHERE o.order_number = $1`,
    [normalizeOrderNumber(orderNumber)],
  );
  const order = rows[0];
  // Same message for "no order" and "wrong phone" so numbers cannot be probed.
  if (!order || !phonesMatch(order.customer_phone, phone)) {
    throw ApiError.notFound('No receipt found for this order number and phone number');
  }
  if (order.payment_status !== PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('The receipt is available after your payment has been verified');
  }
  const rec = await query(
    `SELECT r.id FROM receipts r JOIN payments p ON p.id = r.payment_id
      WHERE r.order_id = $1 AND p.status = 'paid'
      ORDER BY r.issued_at DESC LIMIT 1`,
    [order.id],
  );
  if (!rec.rows[0]) throw ApiError.notFound('Receipt is being prepared. Please try again shortly.');
  return getReceiptPdf(rec.rows[0].id);
}

