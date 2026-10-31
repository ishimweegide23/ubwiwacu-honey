import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { ROLE_GROUPS } from '../config/constants.js';

const router = Router();
const admin = [authMiddleware, requireRole(ROLE_GROUPS.REPORTS)];

router.get('/admin/analytics/dashboard', ...admin, analyticsController.dashboard);
router.get('/admin/analytics/products', ...admin, analyticsController.products);

export default router;
