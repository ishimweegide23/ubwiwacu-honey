import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { query, withTransaction } from '../config/db.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  formatPackageSize,
  formatRWF,
  paginationMeta,
  parseSizeToGrams,
  slugify,
  stockStatus,
} from '../utils/helpers.js';
import { recordAudit } from '../middleware/audit.middleware.js';
import * as stockService from './stock.service.js';

export const UPLOAD_URL_PREFIX = '/uploads/products/';

const ADMIN_COLUMNS = `id, name, slug, sku, short_description, marketing_story, suggested_uses,
  weight_grams, category, price_rwf, currency, image_url, stock_qty, low_stock_at,
  is_available, is_featured, price_history, created_at, updated_at`;

// Fields an admin may set on create/update.
const EDITABLE = [
  'name',
  'slug',
  'sku',
  'short_description',
  'marketing_story',
  'suggested_uses',
  'weight_grams',
  'category',
  'price_rwf',
  'low_stock_at',
  'is_available',
  'is_featured',
];

// --- Mappers -----------------------------------------------------------------

export function toPublicProduct(p) {
  const status = stockStatus(p.stock_qty, p.low_stock_at);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    short_description: p.short_description,
    marketing_story: p.marketing_story,
    suggested_uses: p.suggested_uses,
    weight_grams: p.weight_grams,
    package_size: formatPackageSize(p.weight_grams),
    category: p.category,
    price_rwf: p.price_rwf,
    price_display: formatRWF(p.price_rwf),
    currency: p.currency,
    image_url: p.image_url,
    is_featured: p.is_featured,
    in_stock: p.stock_qty > 0,
    stock_status: status,
    // Exact count is shown only when low, so the storefront can say "Only 3 left".
    stock_left: status === 'low_stock' ? p.stock_qty : null,
  };
}

export function toAdminProduct(p) {
  return {
    ...p,
    package_size: formatPackageSize(p.weight_grams),
    price_display: formatRWF(p.price_rwf),
    stock_status: stockStatus(p.stock_qty, p.low_stock_at),
    is_low_stock: p.stock_qty <= p.low_stock_at,
  };
}

// --- Filters -----------------------------------------------------------------

function buildFilters({ size, category, featured, q, available, lowStock }, { publicOnly }) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (publicOnly) where.push('is_available = true');
  else if (available !== undefined) add('is_available = ?', available);

  if (size !== undefined && size !== null && size !== '') {
    const grams = parseSizeToGrams(size);
    if (!grams) throw ApiError.badRequest('Invalid size filter. Use e.g. 350g, 500g, 1kg, 5kg');
    add('weight_grams = ?', grams);
  }
  if (category) add('category = ?', category);
  if (featured !== undefined) add('is_featured = ?', featured);
  if (lowStock === true) where.push('stock_qty <= low_stock_at');
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(name ILIKE $${i} OR sku ILIKE $${i} OR short_description ILIKE $${i})`);
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function listInternal(filters, { page, limit, offset }, { publicOnly }) {
  const { where, params } = buildFilters(filters, { publicOnly });
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM products ${where}`, params);
  const total = countRes.rows[0].total;

  const dataParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT ${ADMIN_COLUMNS} FROM products ${where}
      ORDER BY category ASC, weight_grams ASC, name ASC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );
  return { rows, meta: paginationMeta(page, limit, total) };
}

// --- Public --------------------------------------------------------------------

export async function listPublicProducts(filters, pagination) {
  const { rows, meta } = await listInternal(filters, pagination, { publicOnly: true });
  return { items: rows.map(toPublicProduct), pagination: meta };
}

export async function getPublicProductBySlug(slug) {
  const { rows } = await query(
    `SELECT ${ADMIN_COLUMNS} FROM products WHERE slug = $1 AND is_available = true`,
    [slug],
  );
  if (!rows[0]) throw ApiError.notFound('Product not found');
  const product = rows[0];

  // Related: same category first, then nearest size. Excludes the product itself.
  const related = await query(
    `SELECT ${ADMIN_COLUMNS} FROM products
      WHERE is_available = true AND id <> $1
      ORDER BY (category = $2) DESC, ABS(weight_grams - $3) ASC
      LIMIT 3`,
    [product.id, product.category, product.weight_grams],
  );

  return { ...toPublicProduct(product), related: related.rows.map(toPublicProduct) };
}

// --- Admin -------------------------------------------------------------------

export async function listAdminProducts(filters, pagination) {
  const { rows, meta } = await listInternal(filters, pagination, { publicOnly: false });
  return { items: rows.map(toAdminProduct), pagination: meta };
}

export async function getProductById(id) {
  const { rows } = await query(`SELECT ${ADMIN_COLUMNS} FROM products WHERE id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Product not found');
  return toAdminProduct(rows[0]);
}

async function ensureUniqueSlug(client, base, excludeId = null) {
  const root = slugify(base) || 'product';
  let candidate = root;
  for (let i = 2; i < 100; i += 1) {
    const { rows } = await client.query(
      'SELECT 1 FROM products WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1',
      [candidate, excludeId],
    );
    if (!rows.length) return candidate;
    candidate = `${root}-${i}`;
  }
  throw ApiError.conflict('Could not generate a unique slug');
}

export async function createProduct(data, actor) {
  return withTransaction(async (client) => {
    const slug = await ensureUniqueSlug(client, data.slug || data.name);
    const stockQty = data.stock_qty ?? 0;
    const now = new Date().toISOString();
    const history = [
      { price_rwf: data.price_rwf, previous_price_rwf: null, changed_at: now, changed_by: actor?.userId ?? null },
    ];

    const { rows } = await client.query(
      `INSERT INTO products
         (name, slug, sku, short_description, marketing_story, suggested_uses,
          weight_grams, category, price_rwf, stock_qty, low_stock_at,
          is_available, is_featured, price_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13)
       RETURNING ${ADMIN_COLUMNS}`,
      [
        data.name,
        slug,
        data.sku ?? null,
        data.short_description ?? null,
        data.marketing_story ?? null,
        data.suggested_uses ?? null,
        data.weight_grams,
        data.category ?? 'standard',
        data.price_rwf,
        data.low_stock_at ?? 10,
        data.is_available ?? true,
        data.is_featured ?? false,
        JSON.stringify(history),
      ],
    );
    const product = rows[0];

    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.PRODUCT_CREATE,
      recordType: 'product',
      recordId: product.id,
      details: { name: product.name, sku: product.sku, price_rwf: product.price_rwf },
    });

    // Opening stock is recorded as a stock adjustment so the audit trail is complete.
    if (stockQty > 0) {
      await stockService.changeStock(client, {
        productId: product.id,
        delta: stockQty,
        reason: 'opening_stock',
        actor,
      });
      product.stock_qty = stockQty;
    }

    return toAdminProduct(product);
  });
}

export async function updateProduct(id, data, actor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT ${ADMIN_COLUMNS} FROM products WHERE id = $1 FOR UPDATE`, [id]);
    const current = rows[0];
    if (!current) throw ApiError.notFound('Product not found');

    const changes = {};
    for (const key of EDITABLE) {
      if (data[key] !== undefined && data[key] !== current[key]) changes[key] = data[key];
    }
    // Slugs only change when explicitly sent, so existing shop links keep working after a rename.
    if (changes.slug !== undefined) {
      changes.slug = await ensureUniqueSlug(client, changes.slug, id);
      if (changes.slug === current.slug) delete changes.slug;
    }

    if (!Object.keys(changes).length) return toAdminProduct(current);

    let priceHistory = Array.isArray(current.price_history) ? current.price_history : [];
    if (changes.price_rwf !== undefined) {
      priceHistory = [
        ...priceHistory,
        {
          price_rwf: changes.price_rwf,
          previous_price_rwf: current.price_rwf,
          changed_at: new Date().toISOString(),
          changed_by: actor?.userId ?? null,
          reason: data.price_change_reason ?? null,
        },
      ];
    }

    const sets = [];
    const params = [id];
    for (const [key, value] of Object.entries(changes)) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    params.push(JSON.stringify(priceHistory));
    sets.push(`price_history = $${params.length}`);
    sets.push('updated_at = now()');

    const updated = await client.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $1 RETURNING ${ADMIN_COLUMNS}`,
      params,
    );

    const diff = {};
    for (const key of Object.keys(changes)) diff[key] = { from: current[key], to: changes[key] };
    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      recordType: 'product',
      recordId: id,
      details: { changes: diff },
    });

    return toAdminProduct(updated.rows[0]);
  });
}

/** Soft delete: the product disappears from the shop but history and old orders stay intact. */
export async function softDeleteProduct(id, actor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE products SET is_available = false, is_featured = false, updated_at = now()
        WHERE id = $1 RETURNING ${ADMIN_COLUMNS}`,
      [id],
    );
    if (!rows[0]) throw ApiError.notFound('Product not found');
    await recordAudit(client, {
      actor,
      action: AUDIT_ACTIONS.PRODUCT_DELETE,
      recordType: 'product',
      recordId: id,
      details: { soft_delete: true, name: rows[0].name },
    });
    return toAdminProduct(rows[0]);
  });
}

/**
 * Admin stock correction. Either { adjustment: +/-n } or { quantity: n } (absolute).
 */
export async function adjustProductStock(id, { adjustment, quantity, reason }, actor) {
  return withTransaction(async (client) => {
    let result;
    if (quantity !== undefined) {
      result = await stockService.setStock(client, { productId: id, quantity, reason, actor });
    } else {
      result = await stockService.changeStock(client, { productId: id, delta: adjustment, reason, actor });
    }
    const { rows } = await client.query(`SELECT ${ADMIN_COLUMNS} FROM products WHERE id = $1`, [id]);
    return { product: toAdminProduct(rows[0]), stock_change: result };
  });
}

function localImagePath(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith(UPLOAD_URL_PREFIX)) return null;
  const file = path.basename(imageUrl);
  return path.join(env.UPLOAD_STORAGE, file);
}

export async function setProductImage(id, file, actor) {
  const imageUrl = `${UPLOAD_URL_PREFIX}${file.filename}`;
  let previous;
  try {
    const product = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT image_url FROM products WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw ApiError.notFound('Product not found');
      previous = rows[0].image_url;

      const updated = await client.query(
        `UPDATE products SET image_url = $2, updated_at = now() WHERE id = $1 RETURNING ${ADMIN_COLUMNS}`,
        [id, imageUrl],
      );
      await recordAudit(client, {
        actor,
        action: AUDIT_ACTIONS.PRODUCT_IMAGE,
        recordType: 'product',
        recordId: id,
        details: { from: previous, to: imageUrl },
      });
      return updated.rows[0];
    });

    const oldPath = localImagePath(previous);
    if (oldPath) {
      fs.unlink(oldPath).catch((err) => logger.warn('Could not delete old product image', { error: err.message }));
    }
    return toAdminProduct(product);
  } catch (err) {
    // Do not leave orphan files when the DB update fails.
    await fs.unlink(file.path).catch(() => {});
    throw err;
  }
}
