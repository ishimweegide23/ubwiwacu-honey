import { AUDIT_ACTIONS } from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { recordAudit } from '../middleware/audit.middleware.js';

/**
 * All stock changes go through here so every change:
 *  - happens on a row locked FOR UPDATE (no lost updates / double counting),
 *  - can never take stock_qty below zero,
 *  - writes an audit_logs row: action='stock.adjust', details={before, after, delta, reason, ...}.
 * Every function needs a transaction client.
 */

/**
 * Lock the given products (in a stable order, to avoid deadlocks) and return a Map id -> row.
 */
export async function lockProducts(client, productIds) {
  const ids = [...new Set(productIds)].sort();
  if (!ids.length) return new Map();
  const { rows } = await client.query(
    `SELECT id, name, slug, sku, weight_grams, category, price_rwf, currency,
            stock_qty, low_stock_at, is_available
       FROM products
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Change one product's stock by `delta` (negative = take out).
 * Returns { product_id, before, after }.
 */
export async function changeStock(client, { productId, delta, reason, actor, orderId = null, extra = {} }) {
  const d = Number(delta);
  if (!Number.isInteger(d) || d === 0) {
    throw ApiError.badRequest('Stock change must be a non-zero whole number');
  }

  const { rows } = await client.query(
    'SELECT id, name, stock_qty FROM products WHERE id = $1 FOR UPDATE',
    [productId],
  );
  const product = rows[0];
  if (!product) throw ApiError.notFound('Product not found');

  const before = product.stock_qty;
  const after = before + d;
  if (after < 0) {
    throw ApiError.conflict(
      `Not enough stock for "${product.name}". Available: ${before}, requested: ${Math.abs(d)}`,
    );
  }

  await client.query('UPDATE products SET stock_qty = $2, updated_at = now() WHERE id = $1', [
    productId,
    after,
  ]);

  await recordAudit(client, {
    actor,
    action: AUDIT_ACTIONS.STOCK_ADJUST,
    recordType: 'product',
    recordId: productId,
    details: { before, after, delta: d, reason, order_id: orderId, ...extra },
  });

  return { product_id: productId, before, after };
}

/** Set an absolute stock level (admin correction). */
export async function setStock(client, { productId, quantity, reason, actor }) {
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < 0) throw ApiError.badRequest('Stock quantity must be 0 or more');

  const { rows } = await client.query('SELECT stock_qty FROM products WHERE id = $1 FOR UPDATE', [
    productId,
  ]);
  if (!rows[0]) throw ApiError.notFound('Product not found');
  const delta = q - rows[0].stock_qty;
  if (delta === 0) return { product_id: productId, before: q, after: q };
  return changeStock(client, { productId, delta, reason, actor, extra: { mode: 'set' } });
}

/** Reserve (take out) stock for order lines: [{ product_id, quantity }]. */
export async function reserveForLines(client, lines, { reason, actor, orderId }) {
  const sorted = [...lines].sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
  const results = [];
  for (const line of sorted) {
    results.push(
      await changeStock(client, {
        productId: line.product_id,
        delta: -line.quantity,
        reason,
        actor,
        orderId,
      }),
    );
  }
  return results;
}

/**
 * Put back stock for every item of an order (cancel / void / refund-before-dispatch).
 * Items whose product was deleted (product_id NULL) are skipped.
 */
export async function restoreForOrder(client, orderId, { reason, actor }) {
  const { rows } = await client.query(
    `SELECT product_id, SUM(quantity)::int AS quantity
       FROM order_items
      WHERE order_id = $1 AND product_id IS NOT NULL
      GROUP BY product_id
      ORDER BY product_id`,
    [orderId],
  );
  const results = [];
  for (const row of rows) {
    results.push(
      await changeStock(client, {
        productId: row.product_id,
        delta: row.quantity,
        reason,
        actor,
        orderId,
      }),
    );
  }
  return results;
}
