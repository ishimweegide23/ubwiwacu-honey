import { Router } from 'express';
import { param, query as q } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { paginationMeta, parsePagination } from '../utils/helpers.js';
import { query } from '../config/db.js';
import { ROLE_GROUPS } from '../config/constants.js';

// Who buys from us: every customer with their orders, spend and last delivery place.
const router = Router();
const admin = [authMiddleware, requireRole(ROLE_GROUPS.ORDERS)];

// Spend counts paid orders only (same rule as revenue).
const STATS = `
  COUNT(o.id)::int                                                        AS order_count,
  COALESCE(SUM(o.total_rwf) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint AS total_spent_rwf,
  COALESCE(SUM(oi.units), 0)::int                                         AS units_bought,
  MAX(o.created_at)                                                       AS last_order_at,
  MIN(o.created_at)                                                       AS first_order_at`;

router.get(
  '/admin/customers',
  ...admin,
  validate([
    q('q').optional().isString().isLength({ max: 100 }),
    q('sort').optional().isIn(['recent', 'spend', 'orders']),
    q('page').optional().isInt({ min: 1 }),
    q('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const params = [];
    let where = '';
    if (req.query.q) {
      params.push(`%${req.query.q.trim()}%`);
      where = `WHERE c.name ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1`;
    }
    const order = { spend: 'total_spent_rwf DESC', orders: 'order_count DESC' }[req.query.sort] || 'last_order_at DESC NULLS LAST';
    const total = (await query(`SELECT COUNT(*)::int AS n FROM customers c ${where}`, params)).rows[0].n;
    const { rows } = await query(
      `SELECT c.id, c.name, c.phone, c.email, c.created_at, ${STATS},
              (SELECT concat_ws(', ', lo.delivery_village, lo.delivery_sector, lo.delivery_district)
                 FROM orders lo WHERE lo.customer_id = c.id AND lo.fulfilment_type = 'delivery'
                ORDER BY lo.created_at DESC LIMIT 1) AS last_location
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         LEFT JOIN LATERAL (SELECT SUM(quantity) AS units FROM order_items WHERE order_id = o.id) oi ON true
         ${where}
        GROUP BY c.id
        ORDER BY ${order}, c.name
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: rows, pagination: paginationMeta(page, limit, total) });
  }),
);

router.get(
  '/admin/customers/:id',
  ...admin,
  validate([param('id').isUUID().withMessage('Invalid customer id')]),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.name, c.phone, c.email, c.created_at, ${STATS}
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         LEFT JOIN LATERAL (SELECT SUM(quantity) AS units FROM order_items WHERE order_id = o.id) oi ON true
        WHERE c.id = $1
        GROUP BY c.id`,
      [req.params.id],
    );
    if (!rows[0]) throw ApiError.notFound('Customer not found');
    const orders = await query(
      `SELECT o.id, o.order_number, o.source, o.payment_status, o.fulfilment_status, o.fulfilment_type,
              o.total_rwf, o.created_at, o.delivery_recipient_name, o.delivery_phone, o.delivery_address,
              o.delivery_province, o.delivery_district, o.delivery_sector, o.delivery_cell, o.delivery_village,
              o.delivery_landmark,
              (SELECT json_agg(json_build_object('name', product_name, 'size', package_size, 'quantity', quantity)
                        ORDER BY product_name)
                 FROM order_items WHERE order_id = o.id) AS items
         FROM orders o WHERE o.customer_id = $1
        ORDER BY o.created_at DESC LIMIT 100`,
      [req.params.id],
    );
    // What they buy most.
    const favourites = await query(
      `SELECT oi.product_name, oi.package_size, SUM(oi.quantity)::int AS units
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.customer_id = $1
        GROUP BY oi.product_name, oi.package_size
        ORDER BY units DESC LIMIT 5`,
      [req.params.id],
    );
    res.json({ success: true, data: { ...rows[0], orders: orders.rows, favourites: favourites.rows } });
  }),
);

export default router;
