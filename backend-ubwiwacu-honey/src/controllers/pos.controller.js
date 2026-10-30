import { asyncHandler } from '../utils/asyncHandler.js';
import { clean, toInt } from '../utils/helpers.js';
import * as posService from '../services/pos.service.js';

export const sale = asyncHandler(async (req, res) => {
  const b = req.body;
  const data = await posService.createSale(
    {
      items: (b.items || []).map((i) => ({ productId: i?.productId ?? i?.product_id, quantity: toInt(i?.quantity, NaN) })),
      customer_name: clean(b.customer_name),
      customer_phone: clean(b.customer_phone),
      customer_email: clean(b.customer_email)?.toLowerCase() ?? null,
      payment_method: clean(b.payment_method),
      transaction_ref: clean(b.transaction_ref),
      notes: clean(b.notes),
    },
    req.actor,
  );
  res.status(201).json({ success: true, data, message: `Sale completed. Receipt ${data.receipt.receipt_number}` });
});

export const voidSale = asyncHandler(async (req, res) => {
  const data = await posService.voidSale(req.params.id, { reason: clean(req.body.reason) }, req.actor);
  res.json({ success: true, data, message: 'Sale voided, payment refunded and stock restored' });
});
