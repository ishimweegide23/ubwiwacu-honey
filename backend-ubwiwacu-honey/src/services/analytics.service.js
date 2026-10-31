import { query } from '../config/db.js';
import { formatPackageSize } from '../utils/helpers.js';

const VELOCITY_DAYS = 30;
const REORDER_DAYS = 14;

/**
 * Admin overview. Revenue counts ONLY verified (paid) payments.
 */
export async function getDashboard() {
  const [counts, revenue, stock, recent, daily, sources, customers] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE payment_status IN ('pending','rejected')
                           AND fulfilment_status NOT IN ('cancelled','refunded'))::int AS awaiting_payment,
        COUNT(*) FILTER (WHERE payment_status = 'verification')::int                  AS awaiting_verification,
        COUNT(*) FILTER (WHERE payment_status = 'paid')::int                          AS confirmed,
        COUNT(*) FILTER (WHERE payment_status = 'paid'
                           AND fulfilment_status IN ('paid','preparing','ready'))::int AS awaiting_fulfilment,
        COUNT(*) FILTER (WHERE fulfilment_status = 'fulfilled')::int                  AS completed,
        COUNT(*) FILTER (WHERE fulfilment_status = 'cancelled')::int                  AS cancelled,
        COUNT(*) FILTER (WHERE fulfilment_status = 'refunded')::int                   AS refunded,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Kigali') AT TIME ZONE 'Africa/Kigali')::int AS orders_today
      FROM orders`),
    query(`
      SELECT
        COALESCE(SUM(amount_rwf), 0)::bigint AS verified_revenue_rwf,
        COALESCE(SUM(amount_rwf) FILTER (WHERE verified_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Kigali') AT TIME ZONE 'Africa/Kigali'), 0)::bigint AS verified_revenue_today_rwf,
        COALESCE(SUM(amount_rwf) FILTER (WHERE verified_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Kigali') AT TIME ZONE 'Africa/Kigali'), 0)::bigint AS verified_revenue_month_rwf,
        COUNT(*)::int AS verified_payments
      FROM payments WHERE status = 'paid'`),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE is_available AND stock_qty <= low_stock_at)::int AS low_stock_count,
        COUNT(*) FILTER (WHERE is_available AND stock_qty = 0)::int AS out_of_stock_count,
        COALESCE(json_agg(json_build_object('id', id, 'name', name, 'stock_qty', stock_qty, 'low_stock_at', low_stock_at)
                 ORDER BY stock_qty ASC) FILTER (WHERE is_available AND stock_qty <= low_stock_at), '[]') AS low_stock_products
      FROM products`),
    query(`
      SELECT id, order_number, source, customer_name, total_rwf, payment_status, fulfilment_status, created_at
        FROM orders ORDER BY created_at DESC LIMIT 10`),
    // Last 14 days (Kigali time): orders placed and verified revenue per day, gaps filled with 0.
    query(`
      WITH days AS (
        SELECT generate_series(
                 (date_trunc('day', now() AT TIME ZONE 'Africa/Kigali') - interval '13 days')::date,
                 (now() AT TIME ZONE 'Africa/Kigali')::date, interval '1 day')::date AS day)
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             (SELECT COUNT(*)::int FROM orders o WHERE (o.created_at AT TIME ZONE 'Africa/Kigali')::date = d.day) AS orders,
             (SELECT COALESCE(SUM(p.amount_rwf), 0)::bigint FROM payments p
               WHERE p.status = 'paid' AND (p.verified_at AT TIME ZONE 'Africa/Kigali')::date = d.day) AS revenue_rwf
        FROM days d ORDER BY d.day`),
    query(`SELECT source, COUNT(*)::int AS orders FROM orders GROUP BY source ORDER BY orders DESC`),
    query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS new_30d
             FROM customers`),
  ]);

  return {
    orders: counts.rows[0],
    ...revenue.rows[0],
    ...stock.rows[0],
    recent_orders: recent.rows,
    daily: daily.rows.map((r) => ({ ...r, revenue_rwf: Number(r.revenue_rwf) })),
    orders_by_source: sources.rows,
    customers: customers.rows[0],
    // Feedback and wholesale enquiries are not built yet.
    new_enquiries: 0,
    recent_feedback: [],
  };
}

/**
 * Per-product intelligence: sold, revenue (paid only), stock, velocity and restock forecast.
 */
export async function getProductAnalytics() {
  const { rows } = await query(
    `WITH sold AS (
       SELECT oi.product_id,
              SUM(oi.quantity)::int                                        AS units_sold,
              SUM(oi.line_total_rwf)::bigint                               AS revenue_rwf,
              COALESCE(SUM(oi.quantity) FILTER (WHERE o.created_at >= now() - make_interval(days => $1)), 0)::int AS units_last_period
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid'
        GROUP BY oi.product_id
     )
     SELECT p.id, p.name, p.sku, p.slug, p.weight_grams, p.category, p.price_rwf,
            p.stock_qty AS stock_remaining, p.low_stock_at, p.is_available,
            COALESCE(s.units_sold, 0)        AS units_sold,
            COALESCE(s.revenue_rwf, 0)       AS revenue_rwf,
            COALESCE(s.units_last_period, 0) AS units_last_30d
       FROM products p
       LEFT JOIN sold s ON s.product_id = p.id
      ORDER BY p.category, p.weight_grams`,
    [VELOCITY_DAYS],
  );

  const products = rows.map((p) => {
    const velocity = Number((p.units_last_30d / VELOCITY_DAYS).toFixed(2));
    const daysUntilStockout = velocity > 0 ? Math.floor(p.stock_remaining / velocity) : null;
    return {
      ...p,
      package_size: formatPackageSize(p.weight_grams),
      is_low_stock: p.stock_remaining <= p.low_stock_at,
      velocity_30d: velocity,
      days_until_stockout: daysUntilStockout,
      // Units needed to cover the next 30 days at current speed.
      suggested_reorder_qty: velocity > 0 ? Math.max(0, Math.ceil(velocity * 30) - p.stock_remaining) : 0,
    };
  });

  const active = products.filter((p) => p.is_available);
  const byUnitsDesc = [...active].sort((a, b) => b.units_sold - a.units_sold || b.revenue_rwf - a.revenue_rwf);
  const byUnitsAsc = [...active].sort((a, b) => a.units_sold - b.units_sold || a.revenue_rwf - b.revenue_rwf);

  return {
    period_days: VELOCITY_DAYS,
    products,
    best_sellers: byUnitsDesc.slice(0, 5),
    slow_movers: byUnitsAsc.slice(0, 5),
    reorder_alerts: active.filter(
      (p) => p.is_low_stock || (p.days_until_stockout !== null && p.days_until_stockout < REORDER_DAYS),
    ),
    totals: {
      units_sold: products.reduce((s, p) => s + p.units_sold, 0),
      revenue_rwf: products.reduce((s, p) => s + Number(p.revenue_rwf), 0),
      stock_units: products.reduce((s, p) => s + p.stock_remaining, 0),
    },
  };
}
