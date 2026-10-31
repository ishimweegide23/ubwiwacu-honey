import { asyncHandler } from '../utils/asyncHandler.js';
import * as analyticsService from '../services/analytics.service.js';

export const dashboard = asyncHandler(async (req, res) => {
  const data = await analyticsService.getDashboard();
  res.json({ success: true, data });
});

export const products = asyncHandler(async (req, res) => {
  const data = await analyticsService.getProductAnalytics();
  res.json({ success: true, data });
});
