import { withTransaction } from '../config/db.js';
import { AUDIT_ACTIONS, ORDER_SOURCES, PAYMENT_METHODS, PAYMENT_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { recordAudit } from '../middleware/audit.middleware.js';
import * as stockService from './stock.service.js';
import * as receiptService from './receipt.service.js';
import { getAdminOrder, insertOrderItems, lockOrderById, nextOrderNumber, priceItems, upsertCustomer } from './order.service.js';

const WALK_IN_NAME = 'Walk-in Customer';
const WALK_IN_PHONE = 'N/A';

/**
 * In-shop sale: one transaction creates a PAID + FULFILLED order, decrements stock,
 * records the payment and issues the receipt immediately.
 */
export async function createSale(input, actor) {
  const method = input.payment_method;
  if (method !== PAYMENT_METHODS.CASH && !input.transaction_ref) {
    throw ApiError.unprocessable('transaction_ref is required for MoMo, Airtel and bank payments');
  }

  const result = await withTransaction(async (client) => {
    const { lines, subtotal } = await priceItems(client, input.items);
    const discount = 0;
    const total = subtotal - discount;

    if (input.transaction_ref) {
      const dup = await client.query(
        `SELECT 1 FROM payments WHERE lower(transaction_ref) = lower($1) AND status IN ('verification','paid') LIMIT 1`,
        [input.transaction_ref],
      );
      if (dup.rows.length) throw ApiError.conflict('This transaction reference has already been used');
    }

    const orderNumber = await nextOrderNumber(client);
    const customerName = input.customer_name || WALK_IN_NAME;
    const customerPhone = input.customer_phone || WALK_IN_PHONE;
    const customerId = input.customer_phone
      ? await upsertCustomer(client, { name: customerName, phone: input.customer_phone, email: input.customer_email })
      : null;

    const { rows } = await client.query(
      `INSERT INTO orders (
         order_number, customer_id, source, entered_by, payment_status, fulfilment_status,
         subtotal_rwf, discount_rwf, total_rwf, amount_paid_rwf, balance_rwf,
         fulfilment_type, customer_name, customer_phone, customer_email, notes)
       VALUES ($1,$2,'pos',$3,'paid','fulfilled',$4,$5,$6,$6,0,'collection',$7,$8,$9,$10)
       RETURNING *`,
      [
        orderNumber,
        customerId,
        actor?.userId ?? null,
        subtotal,
        discount,
        total,
        customerName,
        customerPhone,
        input.customer_email || null,
        input.notes || null,
      ],
    );
    const order = rows[0];

    await insertOrderItems(client, order.id, lines);
    await stockService.reserveForLines(client, lines, {
      reason: `pos_sale:${orderNumber}`,
      actor,
      orderId: order.id,
    });

    const pay = await client.query(
      `INSERT INTO payments (order_id, amount_rwf, method, status, transaction_ref, verified_by, verified_at)
       VALUES ($1, $2, $3, 'paid', $4, $5, now()) RETURNING *`,
      [order.id, total, method, input.transaction_ref || null, actor?.userId ?? null],
    );
    const payment = pay.rows[0];

    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.POS_SALE,
      recordType: 'order',
      recordId: order.id,
      details: {
        order_number: orderNumber,
        total_rwf: total,
        method,
        transaction_ref: input.transaction_ref || null,
        items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      },
    });

    const { receipt } = await receiptService.issueReceiptForPayment(client, payment.id, actor);
    return { orderId: order.id, receiptId: receipt.id };
  });

  if (input.customer_email) receiptService.deliverReceiptInBackground(result.receiptId);

  const order = await getAdminOrder(result.orderId);
  const receipt = order.receipts.find((r) => r.id === result.receiptId);
  return {
    order,
    receipt: {
      id: receipt.id,
      receipt_number: receipt.receipt_number,
      amount_rwf: receipt.amount_rwf,
      file_path: receipt.file_path,
      pdf_url: `/api/admin/receipts/${receipt.id}/pdf`,
      html_url: `/api/admin/receipts/${receipt.id}/html`,
    },
  };
}

/** Void a POS sale: restore stock, refund the payment, keep the receipt with a correction note. */
export async function voidSale(orderId, { reason }, actor) {
  await withTransaction(async (client) => {
    const order = await lockOrderById(client, orderId);
    if (order.source !== ORDER_SOURCES.POS) throw ApiError.badRequest('Only POS sales can be voided here');
    if (order.payment_status === PAYMENT_STATUS.REFUNDED || order.fulfilment_status === 'refunded') {
      throw ApiError.conflict('This sale has already been voided / refunded');
    }

    const restored = await stockService.restoreForOrder(client, order.id, {
      reason: `pos_void:${order.order_number}`,
      actor,
    });

    await client.query(
      `UPDATE payments SET status = 'refunded', rejection_reason = $2, updated_at = now()
        WHERE order_id = $1 AND status = 'paid'`,
      [order.id, `Voided: ${reason}`],
    );
    await client.query(
      `UPDATE receipts
          SET correction_ref = CASE WHEN correction_ref IS NULL THEN $2 ELSE correction_ref || ' | ' || $2 END,
              updated_at = now()
        WHERE order_id = $1`,
      [order.id, `VOIDED ${new Date().toISOString()}: ${reason}`],
    );
    await client.query(
      `UPDATE orders SET payment_status = 'refunded', fulfilment_status = 'refunded', updated_at = now() WHERE id = $1`,
      [order.id],
    );

    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.POS_VOID,
      recordType: 'order',
      recordId: order.id,
      details: { order_number: order.order_number, reason, total_rwf: order.total_rwf, stock_restored: restored },
    });
  });
  return getAdminOrder(orderId);
}
