import { Router } from 'express';
import { query as q } from 'express-validator';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/db.js';
import { ROLE_GROUPS } from '../config/constants.js';

// GET /api/admin/search?q=  — one box to find orders, customers and products.
const router = Router();

router.get(
  '/admin/search',
  authMiddleware,
  requireRole(ROLE_GROUPS.ORDERS),
  validate([q('q').isString().trim().isLength({ min: 2, max: 80 }).withMessage('Type at least 2 characters')]),
  asyncHandler(async (req, res) => {
    const term = `%${req.query.q.trim()}%`;
    const [orders, customers, products] = await Promise.all([
      query(
        `SELECT o.id, o.order_number, o.customer_name, o.customer_phone, o.total_rwf,
                o.payment_status, o.fulfilment_status, o.created_at
           FROM orders o
          WHERE o.order_number ILIKE $1 OR o.customer_name ILIKE $1 OR o.customer_phone ILIKE $1
             OR o.customer_email ILIKE $1
             OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.transaction_ref ILIKE $1)
          ORDER BY o.created_at DESC LIMIT 6`,
        [term],
      ),
      query(
        `SELECT c.id, c.name, c.phone, c.email,
                (SELECT COUNT(*)::int FROM orders o WHERE o.customer_id = c.id) AS order_count
           FROM customers c
          WHERE c.name ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1
          ORDER BY c.updated_at DESC NULLS LAST LIMIT 5`,
        [term],
      ),
      query(
        `SELECT id, name, sku, slug, price_rwf, stock_qty, low_stock_at, is_available
           FROM products
          WHERE name ILIKE $1 OR sku ILIKE $1
          ORDER BY weight_grams LIMIT 5`,
        [term],
      ),
    ]);
    res.json({ success: true, data: { orders: orders.rows, customers: customers.rows, products: products.rows } });
  }),
);

export default router;
