import { Router } from 'express';
import { query } from 'express-validator';
import * as reportController from '../controllers/report.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { ROLE_GROUPS } from '../config/constants.js';
import { REPORT_TYPES } from '../services/report.service.js';

const router = Router();

const reportQuery = [
  query('type').optional().isIn(REPORT_TYPES).withMessage(`type must be one of: ${REPORT_TYPES.join(', ')}`),
  query('from').optional().isISO8601().withMessage('from must be a date (YYYY-MM-DD)'),
  query('to').optional().isISO8601().withMessage('to must be a date (YYYY-MM-DD)'),
];

router.get('/admin/reports', authMiddleware, requireRole(ROLE_GROUPS.REPORTS), validate(reportQuery), reportController.list);
router.get(
  '/admin/reports/export.csv',
  authMiddleware,
  requireRole(ROLE_GROUPS.REPORTS),
  validate(reportQuery),
  reportController.exportCsv,
);

router.get(
  '/admin/audit',
  authMiddleware,
  requireRole(ROLE_GROUPS.AUDIT),
  validate([
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('action').optional().isString().isLength({ max: 80 }),
    query('record_type').optional().isString().isLength({ max: 40 }),
    query('record_id').optional().isUUID(),
    query('user_id').optional().isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  reportController.audit,
);

export default router;
