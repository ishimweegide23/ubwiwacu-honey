import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { clean, parseDateRange, parsePagination } from '../utils/helpers.js';
import * as receiptService from '../services/receipt.service.js';

function sendPdf(res, { filePath, filename }, disposition = 'inline') {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
}

// --- Admin ---

export const list = asyncHandler(async (req, res) => {
  const q = req.query;
  const range = parseDateRange(q.from, q.to);
  if (range.invalid) throw ApiError.badRequest('Invalid date range. Use from/to as YYYY-MM-DD');
  const data = await receiptService.listReceipts(
    { deliveryStatus: clean(q.deliveryStatus), from: range.from, to: range.to, q: clean(q.q) },
    parsePagination(q),
  );
  res.json({ success: true, data: data.items, pagination: data.pagination });
});

export const getById = asyncHandler(async (req, res) => {
  const data = await receiptService.getReceipt(req.params.id);
  res.json({ success: true, data });
});

export const pdf = asyncHandler(async (req, res) => {
  const file = await receiptService.getReceiptPdf(req.params.id);
  sendPdf(res, file, req.query.download === 'true' ? 'attachment' : 'inline');
});

export const html = asyncHandler(async (req, res) => {
  const page = await receiptService.renderReceiptHtml(req.params.id);
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
  res.type('html').send(page);
});

export const resend = asyncHandler(async (req, res) => {
  const data = await receiptService.resendReceipt(req.params.id, { email: clean(req.body?.email) }, req.actor);
  res.json({ success: true, data, message: `Receipt sent to ${data.sent_to}` });
});

export const retryFailed = asyncHandler(async (req, res) => {
  const data = await receiptService.retryFailedReceipts({ olderThanMinutes: 0 });
  res.json({ success: true, data, message: 'Retry finished' });
});

// --- Public ---

export const publicPdf = asyncHandler(async (req, res) => {
  const file = await receiptService.getPublicReceiptPdf(req.params.orderNumber, clean(req.query.phone));
  sendPdf(res, file, req.query.download === 'true' ? 'attachment' : 'inline');
});
