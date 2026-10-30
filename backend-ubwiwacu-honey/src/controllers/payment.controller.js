import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { clean, parseDateRange, parsePagination } from '../utils/helpers.js';
import * as paymentService from '../services/payment.service.js';

// --- Public ---

export const submitReference = asyncHandler(async (req, res) => {
  const data = await paymentService.submitPaymentReference(
    req.params.orderNumber,
    {
      transaction_ref: clean(req.body.transaction_ref),
      method: clean(req.body.method),
      phone: clean(req.body.phone),
    },
    req.actor,
  );
  res.status(201).json({
    success: true,
    data,
    message: 'Thank you. Your payment reference was received and is being verified. Your order is not confirmed until verification is complete.',
  });
});

// --- Admin ---

export const list = asyncHandler(async (req, res) => {
  const q = req.query;
  const range = parseDateRange(q.from, q.to);
  if (range.invalid) throw ApiError.badRequest('Invalid date range. Use from/to as YYYY-MM-DD');
  const data = await paymentService.listPayments(
    { status: clean(q.status), method: clean(q.method), from: range.from, to: range.to, q: clean(q.q) },
    parsePagination(q),
  );
  res.json({ success: true, data: data.items, pagination: data.pagination });
});

export const verify = asyncHandler(async (req, res) => {
  const data = await paymentService.verifyPayment(
    req.params.orderId,
    {
      payment_id: clean(req.body?.payment_id),
      transaction_ref: clean(req.body?.transaction_ref),
      method: clean(req.body?.method),
      note: clean(req.body?.note),
    },
    req.actor,
  );
  res.json({ success: true, data, message: 'Payment verified. Receipt issued.' });
});

export const reject = asyncHandler(async (req, res) => {
  const data = await paymentService.rejectPayment(
    req.params.orderId,
    { payment_id: clean(req.body.payment_id), rejection_reason: clean(req.body.rejection_reason) },
    req.actor,
  );
  res.json({ success: true, data, message: 'Payment rejected' });
});
