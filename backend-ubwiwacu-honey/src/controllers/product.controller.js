import { asyncHandler } from '../utils/asyncHandler.js';
import { clean, parsePagination, toBool, toInt } from '../utils/helpers.js';
import * as productService from '../services/product.service.js';

const pickProductBody = (b) => {
  const out = {};
  const strings = ['name', 'slug', 'sku', 'short_description', 'marketing_story', 'suggested_uses', 'category', 'price_change_reason'];
  for (const key of strings) if (b[key] !== undefined) out[key] = clean(b[key]);
  for (const key of ['weight_grams', 'price_rwf', 'stock_qty', 'low_stock_at']) {
    if (b[key] !== undefined) out[key] = toInt(b[key]);
  }
  for (const key of ['is_available', 'is_featured']) {
    if (b[key] !== undefined) out[key] = toBool(b[key]);
  }
  return out;
};

// --- Public ---

export const listPublic = asyncHandler(async (req, res) => {
  const q = req.query;
  const data = await productService.listPublicProducts(
    {
      size: clean(q.size),
      category: clean(q.category),
      featured: toBool(q.featured),
      q: clean(q.q),
    },
    parsePagination(q),
  );
  res.json({ success: true, data: data.items, pagination: data.pagination });
});

export const getPublicBySlug = asyncHandler(async (req, res) => {
  const data = await productService.getPublicProductBySlug(req.params.slug);
  res.json({ success: true, data });
});

// --- Admin ---

export const listAdmin = asyncHandler(async (req, res) => {
  const q = req.query;
  const data = await productService.listAdminProducts(
    {
      size: clean(q.size),
      category: clean(q.category),
      featured: toBool(q.featured),
      available: toBool(q.available),
      lowStock: toBool(q.lowStock),
      q: clean(q.q),
    },
    parsePagination(q),
  );
  res.json({ success: true, data: data.items, pagination: data.pagination });
});

export const getById = asyncHandler(async (req, res) => {
  const data = await productService.getProductById(req.params.id);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await productService.createProduct(pickProductBody(req.body), req.actor);
  res.status(201).json({ success: true, data, message: 'Product created' });
});

export const update = asyncHandler(async (req, res) => {
  const body = pickProductBody(req.body);
  delete body.stock_qty; // stock only changes through PATCH /stock (audited adjustment)
  const data = await productService.updateProduct(req.params.id, body, req.actor);
  res.json({ success: true, data, message: 'Product updated' });
});

export const remove = asyncHandler(async (req, res) => {
  const data = await productService.softDeleteProduct(req.params.id, req.actor);
  res.json({ success: true, data, message: 'Product hidden from the shop (soft delete)' });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const data = await productService.adjustProductStock(
    req.params.id,
    {
      adjustment: toInt(req.body.adjustment),
      quantity: toInt(req.body.quantity),
      reason: clean(req.body.reason),
    },
    req.actor,
  );
  res.json({ success: true, data, message: 'Stock updated' });
});

export const uploadImage = asyncHandler(async (req, res) => {
  const data = await productService.setProductImage(req.params.id, req.file, req.actor);
  res.json({ success: true, data, message: 'Image uploaded' });
});
