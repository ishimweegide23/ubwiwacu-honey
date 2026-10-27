import { env } from '../config/env.js';
import { getNextCounter, query, withTransaction } from '../config/db.js';
import {
  AUDIT_ACTIONS,
  CLOSED_FULFILMENT,
  COLLECTION_NOTICE,
  COUNTERS,
  DELIVERY_FIELDS,
  DELIVERY_NOTICE,
  DELIVERY_REQUIRED_FIELDS,
  FULFILMENT_STATUS,
  FULFILMENT_TRANSITIONS,
  FULFILMENT_TYPES,
  IDEMPOTENCY_PREFIX,
  MANUAL_ORDER_SOURCES,
  ORDER_SOURCES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SAFETY_NOTICE,
  PAYMENT_STATUS,
} from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { buildOrderNumber, normalizeOrderNumber } from '../utils/orderNumber.js';
import { formatPackageSize, formatRWF, maskEmail, maskPhone, paginationMeta } from '../utils/helpers.js';
import { recordAudit } from '../middleware/audit.middleware.js';
import * as locationService from './location.service.js';
import * as stockService from './stock.service.js';
import * as emailService from './email.service.js';

// ============================================================================
// Shared building blocks (also used by pos.service)
// ============================================================================

/**
 * Validate requested items, lock the products and price every line from the DB.
 * Client prices are never read. Duplicate product lines are merged.
 * Returns { lines, subtotal }.
 */
export async function priceItems(client, items) {
  if (!Array.isArray(items) || !items.length) {
    throw ApiError.unprocessable('Your order must contain at least one product');
  }

  const merged = new Map();
  for (const item of items) {
    const productId = String(item?.productId ?? item?.product_id ?? '').trim();
    const qty = Number(item?.quantity);
    if (!productId) throw ApiError.unprocessable('Every item needs a productId');
    if (!Number.isInteger(qty) || qty <= 0) {
      throw ApiError.unprocessable('Quantities must be whole numbers greater than zero', [
        { field: 'items', message: `Invalid quantity for product ${productId}` },
      ]);
    }
    merged.set(productId, (merged.get(productId) || 0) + qty);
  }

  const products = await stockService.lockProducts(client, [...merged.keys()]);
  const errors = [];
  const lines = [];

  for (const [productId, quantity] of merged) {
    const p = products.get(productId);
    if (!p) {
      errors.push({ field: 'items', productId, message: 'Product not found' });
    } else if (!p.is_available) {
      errors.push({ field: 'items', productId, message: `"${p.name}" is not available` });
    } else if (p.stock_qty <= 0) {
      errors.push({ field: 'items', productId, message: `"${p.name}" is out of stock` });
    } else if (p.stock_qty < quantity) {
      errors.push({ field: 'items', productId, message: `Only ${p.stock_qty} of "${p.name}" left in stock` });
    } else {
      lines.push({
        product_id: p.id,
        product_name: p.name,
        package_size: formatPackageSize(p.weight_grams),
        unit_price_rwf: p.price_rwf,
        quantity,
        line_total_rwf: p.price_rwf * quantity,
      });
    }
  }

  if (errors.length) throw ApiError.unprocessable('Some items cannot be ordered', errors);

  const subtotal = lines.reduce((sum, l) => sum + l.line_total_rwf, 0);
  return { lines, subtotal };
}

/** Reuse a guest customer row by phone, refreshing name/email; create one otherwise. */
export async function upsertCustomer(client, { name, phone, email }) {
  if (!phone) return null;
  const { rows } = await client.query(
    'SELECT id FROM customers WHERE phone = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE',
    [phone],
  );
  if (rows[0]) {
    await client.query(
      `UPDATE customers
          SET name = COALESCE($2, name), email = COALESCE($3, email), updated_at = now()
        WHERE id = $1`,
      [rows[0].id, name || null, email || null],
    );
    return rows[0].id;
  }
  const inserted = await client.query(
    'INSERT INTO customers (name, phone, email) VALUES ($1, $2, $3) RETURNING id',
    [name, phone, email || null],
  );
  return inserted.rows[0].id;
}

export async function insertOrderItems(client, orderId, lines) {
  for (const l of lines) {
    await client.query(
      `INSERT INTO order_items
         (order_id, product_id, product_name, package_size, unit_price_rwf, quantity, line_total_rwf)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orderId, l.product_id, l.product_name, l.package_size, l.unit_price_rwf, l.quantity, l.line_total_rwf],
    );
  }
}

export async function nextOrderNumber(client) {
  const seq = await getNextCounter(client, COUNTERS.ORDER);
  return buildOrderNumber(seq);
}

/** Lock an order row by id. Throws 404. */
export async function lockOrderById(client, orderId) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!rows[0]) throw ApiError.notFound('Order not found');
  return rows[0];
}

/** Lock an order row by order number. Throws 404. */
export async function lockOrderByNumber(client, orderNumber) {
  const { rows } = await client.query('SELECT * FROM orders WHERE order_number = $1 FOR UPDATE', [
    normalizeOrderNumber(orderNumber),
  ]);
  if (!rows[0]) throw ApiError.notFound('Order not found');
  return rows[0];
}

export function validateDelivery(input) {
  const type = input.fulfilment_type || FULFILMENT_TYPES.DELIVERY;
  if (!Object.values(FULFILMENT_TYPES).includes(type)) {
    throw ApiError.unprocessable('fulfilment_type must be delivery or collection');
  }
  if (type === FULFILMENT_TYPES.DELIVERY) {
    const errors = DELIVERY_REQUIRED_FIELDS.filter((f) => !input[f]).map((field) => ({
      field,
      message: `${field.replace(/_/g, ' ')} is required for delivery`,
    }));
    if (errors.length) throw ApiError.unprocessable('Delivery details are incomplete', errors);
  }
  return type;
}

// ============================================================================
// Mappers
// ============================================================================

const TIMELINE = [
  { key: 'received', label: 'Order received' },
  { key: 'payment_verification', label: 'Payment being verified' },
  { key: 'paid', label: 'Payment confirmed' },
  { key: 'preparing', label: 'Preparing your order' },
  { key: 'ready', label: 'Ready for delivery / collection' },
  { key: 'fulfilled', label: 'Completed' },
];
const TIMELINE_RANK = {
  received: 0,
  awaiting_payment: 0,
  payment_verification: 1,
  paid: 2,
  preparing: 3,
  ready: 4,
  fulfilled: 5,
};

function buildTimeline(order) {
  if (CLOSED_FULFILMENT.includes(order.fulfilment_status)) {
    return [
      { key: 'received', label: 'Order received', done: true, at: order.created_at },
      {
        key: order.fulfilment_status,
        label: order.fulfilment_status === 'cancelled' ? 'Order cancelled' : 'Order refunded',
        done: true,
        at: order.updated_at,
      },
    ];
  }
  // A paid order may have moved past fulfilment steps even if it skipped "verification".
  let rank = TIMELINE_RANK[order.fulfilment_status] ?? 0;
  if (order.payment_status === PAYMENT_STATUS.VERIFICATION) rank = Math.max(rank, 1);
  if (order.payment_status === PAYMENT_STATUS.PAID) rank = Math.max(rank, 2);
  return TIMELINE.map((step, i) => ({
    key: step.key,
    label: step.label,
    done: i <= rank,
    current: i === rank,
    at: i === 0 ? order.created_at : null,
  }));
}

function customerFacingNotices(order) {
  return {
    delivery_notice: DELIVERY_NOTICE,
    fulfilment_notice: order.fulfilment_type === FULFILMENT_TYPES.COLLECTION ? COLLECTION_NOTICE : null,
    payment_instructions: env.PAYMENT_INSTRUCTIONS || null,
    payment_safety_notice: PAYMENT_SAFETY_NOTICE,
    contact: {
      phone: env.BUSINESS_PHONE,
      whatsapp: env.BUSINESS_WHATSAPP,
      email: env.BUSINESS_EMAIL,
    },
  };
}

/**
 * Safe public view of an order. Order numbers are sequential (guessable), so personal
 * data is masked and internal fields (entered_by, entry_note, notes, ids) are never returned.
 */
export function toPublicOrder(order, items, payments = [], receipt = null, { reveal = false } = {}) {
  const latestPayment = payments[0] || null;
  return {
    order_number: order.order_number,
    source: order.source,
    payment_status: order.payment_status,
    fulfilment_status: order.fulfilment_status,
    fulfilment_type: order.fulfilment_type,
    currency: 'RWF',
    subtotal_rwf: order.subtotal_rwf,
    discount_rwf: order.discount_rwf,
    delivery_fee_rwf: 0,
    total_rwf: order.total_rwf,
    total_display: formatRWF(order.total_rwf),
    amount_paid_rwf: order.amount_paid_rwf,
    balance_rwf: order.balance_rwf,
    customer: {
      name: reveal ? order.customer_name : String(order.customer_name).split(' ')[0],
      phone: reveal ? order.customer_phone : maskPhone(order.customer_phone),
      email: reveal ? order.customer_email : maskEmail(order.customer_email),
    },
    delivery:
      order.fulfilment_type === FULFILMENT_TYPES.DELIVERY
        ? {
            recipient_name: reveal ? order.delivery_recipient_name : String(order.delivery_recipient_name || '').split(' ')[0],
            province: order.delivery_province,
            district: order.delivery_district,
            sector: order.delivery_sector,
            ...(reveal
              ? {
                  phone: order.delivery_phone,
                  email: order.delivery_email,
                  cell: order.delivery_cell,
                  village: order.delivery_village,
                  landmark: order.delivery_landmark,
                  address: order.delivery_address,
                  location_code: order.delivery_location_code,
                }
              : {}),
            preferred_time: order.delivery_preferred_time,
          }
        : null,
    items: items.map((i) => ({
      product_name: i.product_name,
      package_size: i.package_size,
      unit_price_rwf: i.unit_price_rwf,
      quantity: i.quantity,
      line_total_rwf: i.line_total_rwf,
    })),
    payment: latestPayment
      ? {
          method: latestPayment.method,
          method_label: PAYMENT_METHOD_LABELS[latestPayment.method] || latestPayment.method,
          status: latestPayment.status,
          reference_submitted: Boolean(latestPayment.transaction_ref),
          rejection_reason: latestPayment.status === PAYMENT_STATUS.REJECTED ? latestPayment.rejection_reason : null,
          verified_at: latestPayment.verified_at,
        }
      : null,
    can_submit_payment_reference:
      !CLOSED_FULFILMENT.includes(order.fulfilment_status) &&
      [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.REJECTED].includes(order.payment_status),
    receipt_available: Boolean(receipt) && order.payment_status === PAYMENT_STATUS.PAID,
    receipt_number: receipt && order.payment_status === PAYMENT_STATUS.PAID ? receipt.receipt_number : null,
    timeline: buildTimeline(order),
    created_at: order.created_at,
    updated_at: order.updated_at,
    ...customerFacingNotices(order),
  };
}

async function loadRelations(orderId, executor = null) {
  const run = executor ? executor.query.bind(executor) : query;
  const [items, payments, receipts] = await Promise.all([
    run('SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at, product_name', [orderId]),
    run(
      `SELECT p.*, u.name AS verified_by_name
         FROM payments p LEFT JOIN users u ON u.id = p.verified_by
        WHERE p.order_id = $1
        ORDER BY p.created_at DESC`,
      [orderId],
    ),
    run('SELECT * FROM receipts WHERE order_id = $1 ORDER BY issued_at DESC', [orderId]),
  ]);
  return { items: items.rows, payments: payments.rows, receipts: receipts.rows };
}

async function getPublicOrderById(orderId, opts) {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!rows[0]) throw ApiError.notFound('Order not found');
  const rel = await loadRelations(orderId);
  return toPublicOrder(rows[0], rel.items, rel.payments, rel.receipts[0] || null, opts);
}

// ============================================================================
// Create
// ============================================================================

/**
 * When the customer picked a village from the official list, trust the dataset's
 * names (province → village) over whatever text was sent.
 */
async function withOfficialLocation(input) {
  if (!input.delivery_location_code) return input;
  const place = await locationService.resolveVillage(input.delivery_location_code);
  if (!place) return input; // dataset not installed: keep the typed names
  return {
    ...input,
    delivery_province: place.province,
    delivery_district: place.district,
    delivery_sector: place.sector,
    delivery_cell: place.cell,
    delivery_village: place.village,
  };
}

/**
 * Create an order (web checkout or admin manual entry).
 * @param input   validated body
 * @param ctx     { source, actor, enteredBy, entryNote }
 * @returns       { order, duplicate }
 */
export async function createOrder(rawInput, ctx) {
  const input = await withOfficialLocation(rawInput);
  const source = ctx.source || ORDER_SOURCES.WEB;
  const isManual = MANUAL_ORDER_SOURCES.includes(source);
  if (source !== ORDER_SOURCES.WEB && !isManual) {
    throw ApiError.badRequest('Invalid order source');
  }
  if (isManual && !ctx.entryNote) {
    throw ApiError.unprocessable('entry_note is required for manual orders', [
      { field: 'entry_note', message: 'Explain where the order came from (e.g. WhatsApp chat with ...)' },
    ]);
  }

  const fulfilmentType = validateDelivery(input);
  const idemKey = input.idempotencyKey ? `${IDEMPOTENCY_PREFIX}${String(input.idempotencyKey).toLowerCase()}` : null;

  // Fast path: key already completed.
  if (idemKey) {
    const existing = await findOrderIdByIdempotencyKey(idemKey);
    if (existing) {
      return { order: await getPublicOrderById(existing, { reveal: true }), duplicate: true };
    }
  }

  const result = await withTransaction(async (client) => {
    if (idemKey) {
      // Claim the key. A concurrent request with the same key blocks here until we commit.
      const claim = await client.query(
        `INSERT INTO app_meta (key, value) VALUES ($1, '{}'::jsonb)
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [idemKey],
      );
      if (!claim.rows.length) return { duplicateKey: true };
    }

    const { lines, subtotal } = await priceItems(client, input.items);
    const discount = 0; // No discounts on official prices.
    const total = subtotal - discount;
    const orderNumber = await nextOrderNumber(client);

    const customerId = await upsertCustomer(client, {
      name: input.customer_name,
      phone: input.customer_phone,
      email: input.customer_email,
    });

    // For collection orders delivery fields are optional; whatever was sent is kept.
    const delivery = {};
    for (const f of DELIVERY_FIELDS) delivery[f] = input[f] ?? null;

    const { rows } = await client.query(
      `INSERT INTO orders (
         order_number, customer_id, source, entered_by, entry_note,
         payment_status, fulfilment_status,
         subtotal_rwf, discount_rwf, total_rwf, amount_paid_rwf, balance_rwf,
         fulfilment_type, customer_name, customer_phone, customer_email,
         delivery_recipient_name, delivery_phone, delivery_email, delivery_district,
         delivery_sector, delivery_cell, delivery_village, delivery_landmark,
         delivery_preferred_time, notes,
         delivery_province, delivery_location_code, delivery_address)
       VALUES ($1,$2,$3,$4,$5,'pending','received',$6,$7,$8,0,$8,$9,$10,$11,$12,
               $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [
        orderNumber,
        customerId,
        source,
        isManual ? ctx.enteredBy : null,
        isManual ? ctx.entryNote : null,
        subtotal,
        discount,
        total,
        fulfilmentType,
        input.customer_name,
        input.customer_phone,
        input.customer_email || null,
        delivery.delivery_recipient_name,
        delivery.delivery_phone,
        delivery.delivery_email,
        delivery.delivery_district,
        delivery.delivery_sector,
        delivery.delivery_cell,
        delivery.delivery_village,
        delivery.delivery_landmark,
        delivery.delivery_preferred_time,
        input.notes || null,
        delivery.delivery_province,
        delivery.delivery_location_code ? String(delivery.delivery_location_code).toUpperCase() : null,
        delivery.delivery_address,
      ],
    );
    const order = rows[0];

    await insertOrderItems(client, order.id, lines);

    await stockService.reserveForLines(client, lines, {
      reason: `order_reserved:${orderNumber}`,
      actor: ctx.actor,
      orderId: order.id,
    });

    // Record the chosen payment method as a pending payment (no money confirmed yet).
    if (input.payment_method) {
      await client.query(
        `INSERT INTO payments (order_id, amount_rwf, method, status)
         VALUES ($1, $2, $3, 'pending')`,
        [order.id, total, input.payment_method],
      );
    }

    await recordAudit(client, {
      actor: ctx.actor,
      action: isManual ? AUDIT_ACTIONS.ORDER_MANUAL_CREATE : AUDIT_ACTIONS.ORDER_CREATE,
      recordType: 'order',
      recordId: order.id,
      details: {
        order_number: orderNumber,
        source,
        total_rwf: total,
        items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        ...(isManual ? { entry_note: ctx.entryNote } : {}),
      },
    });

    if (idemKey) {
      await client.query(
        `UPDATE app_meta SET value = $2::jsonb, updated_at = now() WHERE key = $1`,
        [idemKey, JSON.stringify({ order_id: order.id, created_at: new Date().toISOString() })],
      );
    }

    return { orderId: order.id };
  });

  if (result.duplicateKey) {
    const existing = await findOrderIdByIdempotencyKey(idemKey);
    if (!existing) throw ApiError.conflict('This order is already being processed. Please wait and check again.');
    return { order: await getPublicOrderById(existing, { reveal: true }), duplicate: true };
  }

  const order = await getPublicOrderById(result.orderId, { reveal: true });

  // Confirmation email after commit, never blocks or fails the checkout.
  if (input.customer_email) {
    emailService
      .sendOrderConfirmation(order, input.customer_email)
      .catch((err) => logger.warn('Order confirmation email failed', { order: order.order_number, error: err.message }));
  }

  return { order, duplicate: false };
}

async function findOrderIdByIdempotencyKey(idemKey) {
  const { rows } = await query(`SELECT value->>'order_id' AS order_id FROM app_meta WHERE key = $1`, [idemKey]);
  return rows[0]?.order_id || null;
}

// ============================================================================
// Public read
// ============================================================================

export async function getPublicOrderByNumber(orderNumber) {
  const { rows } = await query('SELECT * FROM orders WHERE order_number = $1', [normalizeOrderNumber(orderNumber)]);
  if (!rows[0]) throw ApiError.notFound('Order not found. Check the order number and try again.');
  const rel = await loadRelations(rows[0].id);
  return toPublicOrder(rows[0], rel.items, rel.payments, rel.receipts[0] || null);
}

// ============================================================================
// Admin
// ============================================================================

export async function listOrders(filters, { page, limit, offset }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (filters.status) add('o.fulfilment_status = ?', filters.status);
  if (filters.paymentStatus) add('o.payment_status = ?', filters.paymentStatus);
  if (filters.source) add('o.source = ?', filters.source);
  if (filters.fulfilmentType) add('o.fulfilment_type = ?', filters.fulfilmentType);
  if (filters.from) add('o.created_at >= ?', filters.from);
  if (filters.to) add('o.created_at < ?', filters.to);
  if (filters.q) {
    add(
      `(o.order_number ILIKE ? OR o.customer_name ILIKE ? OR o.customer_phone ILIKE ? OR o.customer_email ILIKE ?
        OR EXISTS (SELECT 1 FROM payments px WHERE px.order_id = o.id AND px.transaction_ref ILIKE ?))`,
      `%${filters.q}%`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(`SELECT COUNT(*)::int AS total FROM orders o ${whereSql}`, params);
  const dataParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT o.id, o.order_number, o.source, o.payment_status, o.fulfilment_status, o.fulfilment_type,
            o.customer_name, o.customer_phone, o.customer_email, o.subtotal_rwf, o.discount_rwf,
            o.total_rwf, o.amount_paid_rwf, o.balance_rwf, o.delivery_district, o.created_at, o.updated_at,
            (SELECT COALESCE(SUM(quantity),0)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
            (SELECT method FROM payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_method,
            u.name AS entered_by_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.entered_by
       ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );
  return { items: rows, pagination: paginationMeta(page, limit, count.rows[0].total) };
}

export async function getAdminOrder(orderId) {
  const { rows } = await query(
    `SELECT o.*, u.name AS entered_by_name
       FROM orders o LEFT JOIN users u ON u.id = o.entered_by
      WHERE o.id = $1`,
    [orderId],
  );
  if (!rows[0]) throw ApiError.notFound('Order not found');
  const order = rows[0];
  const rel = await loadRelations(orderId);
  const history = await query(
    `SELECT a.id, a.action, a.details, a.created_at, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE (a.record_type = 'order' AND a.record_id = $1)
         OR (a.record_type = 'payment' AND a.record_id = ANY($2::uuid[]))
         OR (a.record_type = 'receipt' AND a.record_id = ANY($3::uuid[]))
      ORDER BY a.created_at ASC`,
    [orderId, rel.payments.map((p) => p.id), rel.receipts.map((r) => r.id)],
  );
  return {
    ...order,
    items: rel.items,
    payments: rel.payments,
    receipts: rel.receipts,
    history: history.rows,
    allowed_transitions: FULFILMENT_TRANSITIONS[order.fulfilment_status] || [],
    delivery_notice: DELIVERY_NOTICE,
  };
}

export async function createManualOrder(input, actor) {
  return createOrder(input, {
    source: input.source,
    actor,
    enteredBy: actor?.userId ?? null,
    entryNote: input.entry_note,
  });
}

/** Attach a correction note to receipts of an order (receipts are never edited otherwise). */
async function markReceiptCorrections(client, orderId, note) {
  await client.query(
    `UPDATE receipts
        SET correction_ref = CASE WHEN correction_ref IS NULL THEN $2 ELSE correction_ref || ' | ' || $2 END,
            updated_at = now()
      WHERE order_id = $1`,
    [orderId, note],
  );
}

/** Cancel inside an existing transaction (order must be locked). */
async function cancelLocked(client, order, reason, actor) {
  if (CLOSED_FULFILMENT.includes(order.fulfilment_status)) {
    throw ApiError.conflict(`Order is already ${order.fulfilment_status}`);
  }
  if (order.fulfilment_status === FULFILMENT_STATUS.FULFILLED) {
    throw ApiError.conflict('A fulfilled order cannot be cancelled. Use a refund instead.');
  }

  const restored = await stockService.restoreForOrder(client, order.id, {
    reason: `order_cancelled:${order.order_number}`,
    actor,
  });

  const wasPaid = order.payment_status === PAYMENT_STATUS.PAID;
  await client.query(
    `UPDATE payments
        SET status = 'rejected', rejection_reason = COALESCE(rejection_reason, $2), updated_at = now()
      WHERE order_id = $1 AND status IN ('pending','verification')`,
    [order.id, `Order cancelled: ${reason}`],
  );
  if (wasPaid) {
    await client.query(
      `UPDATE payments SET status = 'refunded', updated_at = now() WHERE order_id = $1 AND status = 'paid'`,
      [order.id],
    );
    await markReceiptCorrections(client, order.id, `CANCELLED & REFUNDED ${new Date().toISOString()}: ${reason}`);
  }

  const { rows } = await client.query(
    `UPDATE orders
        SET fulfilment_status = 'cancelled',
            payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [order.id],
  );

  await recordAudit(client, {
    actor,
    action: AUDIT_ACTIONS.ORDER_CANCEL,
    recordType: 'order',
    recordId: order.id,
    details: {
      order_number: order.order_number,
      reason,
      from: order.fulfilment_status,
      payment_refunded: wasPaid,
      stock_restored: restored,
    },
  });
  return rows[0];
}

async function refundLocked(client, order, reason, actor) {
  if (order.payment_status !== PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('Only orders with a verified payment can be refunded');
  }
  const goodsReturnedToStock = order.fulfilment_status !== FULFILMENT_STATUS.FULFILLED;
  let restored = [];
  if (goodsReturnedToStock) {
    restored = await stockService.restoreForOrder(client, order.id, {
      reason: `order_refunded:${order.order_number}`,
      actor,
    });
  }
  await client.query(
    `UPDATE payments SET status = 'refunded', updated_at = now() WHERE order_id = $1 AND status = 'paid'`,
    [order.id],
  );
  await markReceiptCorrections(client, order.id, `REFUNDED ${new Date().toISOString()}: ${reason}`);
  const { rows } = await client.query(
    `UPDATE orders SET fulfilment_status = 'refunded', payment_status = 'refunded', updated_at = now()
      WHERE id = $1 RETURNING *`,
    [order.id],
  );
  await recordAudit(client, {
    actor,
    action: AUDIT_ACTIONS.ORDER_REFUND,
    recordType: 'order',
    recordId: order.id,
    details: { order_number: order.order_number, reason, from: order.fulfilment_status, stock_restored: restored },
  });
  return rows[0];
}

export async function updateFulfilmentStatus(orderId, { status, note }, actor) {
  return withTransaction(async (client) => {
    const order = await lockOrderById(client, orderId);
    const allowed = FULFILMENT_TRANSITIONS[order.fulfilment_status] || [];
    if (!allowed.includes(status)) {
      throw ApiError.conflict(
        `Cannot change status from "${order.fulfilment_status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    if (status === FULFILMENT_STATUS.CANCELLED) {
      if (!note) throw ApiError.unprocessable('A reason (note) is required to cancel an order');
      return cancelLocked(client, order, note, actor);
    }
    if (status === FULFILMENT_STATUS.REFUNDED) {
      if (!note) throw ApiError.unprocessable('A reason (note) is required to refund an order');
      return refundLocked(client, order, note, actor);
    }

    const { rows } = await client.query(
      'UPDATE orders SET fulfilment_status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [orderId, status],
    );
    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.ORDER_STATUS,
      recordType: 'order',
      recordId: orderId,
      details: { order_number: order.order_number, from: order.fulfilment_status, to: status, note: note || null },
    });
    return rows[0];
  }).then(async (order) => {
    if (order.customer_email && order.source !== ORDER_SOURCES.POS) {
      emailService
        .sendStatusUpdate(order)
        .catch((err) => logger.warn('Status update email failed', { order: order.order_number, error: err.message }));
    }
    return getAdminOrder(order.id);
  });
}

export async function cancelOrder(orderId, reason, actor) {
  await withTransaction(async (client) => {
    const order = await lockOrderById(client, orderId);
    return cancelLocked(client, order, reason, actor);
  });
  return getAdminOrder(orderId);
}
