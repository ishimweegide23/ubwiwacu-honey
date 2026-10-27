import { DELIVERY_FIELDS } from '../config/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { clean, parseDateRange, parsePagination, toInt } from '../utils/helpers.js';
import * as orderService from '../services/order.service.js';

/** Pick only known fields from the checkout body. Any client price is dropped here. */
function pickOrderInput(b) {
  const input = {
    items: Array.isArray(b.items)
      ? b.items.map((i) => ({ productId: i?.productId ?? i?.product_id, quantity: toInt(i?.quantity, NaN) }))
      : [],
    customer_name: clean(b.customer_name),
    customer_phone: clean(b.customer_phone),
    customer_email: clean(b.customer_email)?.toLowerCase() ?? null,
    fulfilment_type: clean(b.fulfilment_type) || 'delivery',
    payment_method: clean(b.payment_method),
    notes: clean(b.notes),
    idempotencyKey: clean(b.idempotencyKey ?? b.idempotency_key),
  };
  for (const f of DELIVERY_FIELDS) input[f] = clean(b[f]);
  if (input.delivery_email) input.delivery_email = input.delivery_email.toLowerCase();
  return input;
}

// --- Public ---

export const create = asyncHandler(async (req, res) => {
  const { order, duplicate } = await orderService.createOrder(pickOrderInput(req.body), {
    source: 'web',
    actor: req.actor,
  });
  res.status(duplicate ? 200 : 201).json({
    success: true,
    data: order,
    message: duplicate
      ? 'This order was already placed (same idempotency key). Returning the existing order.'
      : 'Order received. It is awaiting payment.',
  });
});

export const track = asyncHandler(async (req, res) => {
  const data = await orderService.getPublicOrderByNumber(req.params.orderNumber);
  res.json({ success: true, data });
});

// --- Admin ---

export const list = asyncHandler(async (req, res) => {
  const q = req.query;
  const range = parseDateRange(q.from, q.to);
  if (range.invalid) throw ApiError.badRequest('Invalid date range. Use from/to as YYYY-MM-DD');
  const data = await orderService.listOrders(
    {
      status: clean(q.status),
      paymentStatus: clean(q.paymentStatus),
      source: clean(q.source),
      fulfilmentType: clean(q.fulfilmentType),
      from: range.from,
      to: range.to,
      q: clean(q.q),
    },
    parsePagination(q),
  );
  res.json({ success: true, data: data.items, pagination: data.pagination });
});

export const getById = asyncHandler(async (req, res) => {
  const data = await orderService.getAdminOrder(req.params.id);
  res.json({ success: true, data });
});

export const createManual = asyncHandler(async (req, res) => {
  const input = { ...pickOrderInput(req.body), source: clean(req.body.source), entry_note: clean(req.body.entry_note) };
  const { order, duplicate } = await orderService.createManualOrder(input, req.actor);
  res.status(duplicate ? 200 : 201).json({
    success: true,
    data: order,
    message: duplicate ? 'Order already exists for this idempotency key' : 'Manual order created',
  });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const data = await orderService.updateFulfilmentStatus(
    req.params.id,
    { status: clean(req.body.status), note: clean(req.body.note) },
    req.actor,
  );
  res.json({ success: true, data, message: `Order status updated to ${data.fulfilment_status}` });
});

export const cancel = asyncHandler(async (req, res) => {
  const data = await orderService.cancelOrder(req.params.id, clean(req.body.reason), req.actor);
  res.json({ success: true, data, message: 'Order cancelled and stock restored' });
});
