import { Router } from 'express';
import { param, query } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler.js';
import { rateLimitPublicLookup } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as locations from '../services/location.service.js';

const router = Router();
const LEVELS = ['province', 'district', 'sector', 'cell', 'village'];
const cache = (res) => res.set('Cache-Control', 'public, max-age=86400');

// GET /api/locations/search?q=kimihurura&level=village  — live search by name or code
router.get(
  '/locations/search',
  rateLimitPublicLookup,
  validate([
    query('q').isString().trim().isLength({ min: 2, max: 60 }).withMessage('Type at least 2 letters'),
    query('level').optional().isIn(LEVELS),
    query('limit').optional().isInt({ min: 1, max: 30 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const data = await locations.search(req.query.q, { limit: req.query.limit || 12, level: req.query.level });
    res.json({ success: true, data });
  }),
);

// GET /api/locations?parent=RW-D-01  — children of a unit (provinces when no parent)
router.get(
  '/locations',
  validate([query('parent').optional().isString().isLength({ max: 20 })]),
  asyncHandler(async (req, res) => {
    const data = await locations.childrenOf(req.query.parent || null);
    cache(res).json({ success: true, data });
  }),
);

// GET /api/locations/RW-V-00001  — one unit with its full path
router.get(
  '/locations/:code',
  validate([param('code').isString().matches(/^RW-[A-Z0-9-]{1,12}$/i).withMessage('Invalid location code')]),
  asyncHandler(async (req, res) => {
    const data = await locations.getByCode(req.params.code);
    cache(res).json({ success: true, data });
  }),
);

export default router;
