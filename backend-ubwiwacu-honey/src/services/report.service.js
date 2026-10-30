import { query } from '../config/db.js';
import { ApiError } from '../utils/apiError.js';
import { paginationMeta, toCsv } from '../utils/helpers.js';

export const REPORT_TYPES = Object.freeze([
  'orders',
  'sales_by_product',
  'sales_by_size',
  'sales_by_source',
  'verified_payments',
  'outstanding',
  'refunds',
  'best_sellers',
]);

/** Build "AND col >= $n AND col < $m" for a date range. */
function range(column, { from, to }, params) {
  const parts = [];
  if (from) {
    params.push(from);
    parts.push(`${column} >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    parts.push(`${column} < $${params.length}`);
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

const REPORTS = {
  // Every order in the period, any status (for operations, not revenue).
  orders: (r) => {
    const p = [];
    return {
      sql: `SELECT o.order_number, o.created_at, o.source, o.customer_name, o.customer_phone,
                   o.fulfilment_type, o.payment_status, o.fulfilment_status,
                   (SELECT COALESCE(SUM(quantity),0)::int FROM order_items oi WHERE oi.order_id = o.id) AS units,
                   o.subtotal_rwf, o.discount_rwf, o.total_rwf, o.amount_paid_rwf, o.balance_rwf
              FROM orders o WHERE true ${range('o.created_at', r, p)}
             ORDER BY o.created_at DESC`,
      params: p,
    };
  },

  // Paid orders only.
  sales_by_product: (r) => {
    const p = [];
    return {
      sql: `SELECT oi.product_name, oi.package_size,
                   SUM(oi.quantity)::int AS units_sold,
                   COUNT(DISTINCT o.id)::int AS orders,
                   SUM(oi.line_total_rwf)::bigint AS revenue_rwf
              FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.payment_status = 'paid' ${range('o.created_at', r, p)}
             GROUP BY oi.product_name, oi.package_size
             ORDER BY revenue_rwf DESC`,
      params: p,
    };
  },

  sales_by_size: (r) => {
    const p = [];
    return {
      sql: `SELECT oi.package_size,
                   SUM(oi.quantity)::int AS units_sold,
                   COUNT(DISTINCT o.id)::int AS orders,
                   SUM(oi.line_total_rwf)::bigint AS revenue_rwf
              FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.payment_status = 'paid' ${range('o.created_at', r, p)}
             GROUP BY oi.package_size
             ORDER BY revenue_rwf DESC`,
      params: p,
    };
  },

  sales_by_source: (r) => {
    const p = [];
    return {
      sql: `SELECT o.source,
                   COUNT(DISTINCT o.id)::int AS orders,
                   SUM(oi.quantity)::int AS units_sold,
                   SUM(oi.line_total_rwf)::bigint AS revenue_rwf
              FROM orders o JOIN order_items oi ON oi.order_id = o.id
             WHERE o.payment_status = 'paid' ${range('o.created_at', r, p)}
             GROUP BY o.source
             ORDER BY revenue_rwf DESC`,
      params: p,
    };
  },

  verified_payments: (r) => {
    const p = [];
    return {
      sql: `SELECT pay.verified_at, o.order_number, o.customer_name, pay.method, pay.transaction_ref,
                   pay.provider_reference, pay.amount_rwf, u.name AS verified_by, r.receipt_number
              FROM payments pay
              JOIN orders o ON o.id = pay.order_id
              LEFT JOIN users u ON u.id = pay.verified_by
              LEFT JOIN receipts r ON r.payment_id = pay.id
             WHERE pay.status = 'paid' ${range('pay.verified_at', r, p)}
             ORDER BY pay.verified_at DESC`,
      params: p,
    };
  },

  // Orders still waiting for money (not cancelled).
  outstanding: (r) => {
    const p = [];
    return {
      sql: `SELECT o.order_number, o.created_at, o.source, o.customer_name, o.customer_phone,
                   o.payment_status, o.fulfilment_status, o.total_rwf, o.amount_paid_rwf,
                   (o.total_rwf - o.amount_paid_rwf) AS outstanding_rwf,
                   (SELECT transaction_ref FROM payments px WHERE px.order_id = o.id ORDER BY px.created_at DESC LIMIT 1) AS last_reference
              FROM orders o
             WHERE o.payment_status IN ('pending','verification','rejected')
               AND o.fulfilment_status NOT IN ('cancelled','refunded') ${range('o.created_at', r, p)}
             ORDER BY o.created_at ASC`,
      params: p,
    };
  },

  refunds: (r) => {
    const p = [];
    return {
      sql: `SELECT o.order_number, o.source, o.customer_name, pay.method, pay.transaction_ref,
                   pay.amount_rwf, pay.rejection_reason AS note, pay.updated_at AS refunded_at,
                   r.receipt_number, r.correction_ref
              FROM payments pay
              JOIN orders o ON o.id = pay.order_id
              LEFT JOIN receipts r ON r.payment_id = pay.id
             WHERE pay.status = 'refunded' ${range('pay.updated_at', r, p)}
             ORDER BY pay.updated_at DESC`,
      params: p,
    };
  },

  best_sellers: (r) => {
    const p = [];
    return {
      sql: `SELECT oi.product_name, oi.package_size,
                   SUM(oi.quantity)::int AS units_sold,
                   SUM(oi.line_total_rwf)::bigint AS revenue_rwf
              FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.payment_status = 'paid' ${range('o.created_at', r, p)}
             GROUP BY oi.product_name, oi.package_size
             ORDER BY units_sold DESC, revenue_rwf DESC
             LIMIT 10`,
      params: p,
    };
  },
};

function summarize(type, rows) {
  const sum = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  switch (type) {
    case 'orders':
      return { orders: rows.length, total_rwf: sum('total_rwf'), amount_paid_rwf: sum('amount_paid_rwf') };
    case 'sales_by_product':
    case 'sales_by_size':
    case 'best_sellers':
      return { units_sold: sum('units_sold'), revenue_rwf: sum('revenue_rwf') };
    case 'sales_by_source':
      return { orders: sum('orders'), revenue_rwf: sum('revenue_rwf') };
    case 'verified_payments':
      return { payments: rows.length, verified_revenue_rwf: sum('amount_rwf') };
    case 'outstanding':
      return { orders: rows.length, outstanding_rwf: sum('outstanding_rwf') };
    case 'refunds':
      return { refunds: rows.length, refunded_rwf: sum('amount_rwf') };
    default:
      return {};
  }
}

export async function runReport(type, dateRange) {
  const build = REPORTS[type];
  if (!build) throw ApiError.badRequest(`Unknown report type. Use one of: ${REPORT_TYPES.join(', ')}`);
  const { sql, params } = build(dateRange);
  const { rows } = await query(sql, params);
  return {
    type,
    from: dateRange.from ? dateRange.from.toISOString() : null,
    to: dateRange.to ? dateRange.to.toISOString() : null,
    generated_at: new Date().toISOString(),
    summary: summarize(type, rows),
    rows,
  };
}

export async function exportReportCsv(type, dateRange) {
  const report = await runReport(type, dateRange);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `ubwiwacu-${type}-${stamp}.csv`,
    csv: toCsv(report.rows),
  };
}

export async function listAuditLogs(filters, { page, limit, offset }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (filters.action) add('a.action = ?', filters.action);
  if (filters.recordType) add('a.record_type = ?', filters.recordType);
  if (filters.recordId) add('a.record_id = ?', filters.recordId);
  if (filters.userId) add('a.user_id = ?', filters.userId);
  if (filters.from) add('a.created_at >= ?', filters.from);
  if (filters.to) add('a.created_at < ?', filters.to);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${whereSql}`, params);
  const dataParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT a.id, a.action, a.record_type, a.record_id, a.details, a.ip, a.created_at,
            a.user_id, u.name AS user_name, u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );
  return { items: rows, pagination: paginationMeta(page, limit, count.rows[0].total) };
}
