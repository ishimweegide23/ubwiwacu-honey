import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { clean, parseDateRange, parsePagination } from '../utils/helpers.js';
import * as reportService from '../services/report.service.js';

function rangeFrom(q) {
  const range = parseDateRange(q.from, q.to);
  if (range.invalid) throw ApiError.badRequest('Invalid date range. Use from/to as YYYY-MM-DD');
  return range;
}

export const list = asyncHandler(async (req, res) => {
  const data = await reportService.runReport(clean(req.query.type) || 'orders', rangeFrom(req.query));
  res.json({ success: true, data });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const { filename, csv } = await reportService.exportReportCsv(clean(req.query.type) || 'orders', rangeFrom(req.query));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
});

export const audit = asyncHandler(async (req, res) => {
  const q = req.query;
  const range = rangeFrom(q);
  const data = await reportService.listAuditLogs(
    {
      action: clean(q.action),
      recordType: clean(q.record_type ?? q.recordType),
      recordId: clean(q.record_id ?? q.recordId),
      userId: clean(q.user_id ?? q.userId),
      from: range.from,
      to: range.to,
    },
    parsePagination(q),
  );
  res.json({ success: true, data: data.items, pagination: data.pagination });
});
