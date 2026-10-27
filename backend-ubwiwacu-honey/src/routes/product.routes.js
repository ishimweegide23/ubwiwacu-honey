import { Router } from 'express';
import { body, oneOf, param, query } from 'express-validator';
import * as productController from '../controllers/product.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { auditContext } from '../middleware/audit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { uploadProductImage } from '../middleware/upload.middleware.js';
import { PRODUCT_CATEGORIES, ROLE_GROUPS } from '../config/constants.js';

const router = Router();

const listQuery = [
  query('category').optional().isIn(PRODUCT_CATEGORIES).withMessage(`category must be one of: ${PRODUCT_CATEGORIES.join(', ')}`),
  query('featured').optional().isBoolean().withMessage('featured must be true or false'),
  query('size').optional().isString().isLength({ max: 20 }),
  query('q').optional().isString().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or more'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
];

const idParam = param('id').isUUID().withMessage('Invalid product id');

const productFields = (isCreate) => {
  const req = (chain) => (isCreate ? chain : chain.optional());
  return [
    req(body('name')).isString().trim().notEmpty().withMessage('name is required').isLength({ max: 160 }),
    body('slug').optional({ values: 'falsy' }).isString().trim().isLength({ max: 180 }),
    body('sku').optional({ values: 'null' }).isString().trim().isLength({ max: 60 }),
    body('short_description').optional({ values: 'null' }).isString().isLength({ max: 1000 }),
    body('marketing_story').optional({ values: 'null' }).isString().isLength({ max: 5000 }),
    body('suggested_uses').optional({ values: 'null' }).isString().isLength({ max: 2000 }),
    req(body('weight_grams')).isInt({ min: 1, max: 100000 }).withMessage('weight_grams must be a positive whole number'),
    body('category').optional().isIn(PRODUCT_CATEGORIES).withMessage(`category must be one of: ${PRODUCT_CATEGORIES.join(', ')}`),
    req(body('price_rwf')).isInt({ min: 1, max: 100000000 }).withMessage('price_rwf must be a positive whole number'),
    body('low_stock_at').optional().isInt({ min: 0, max: 1000000 }).withMessage('low_stock_at must be 0 or more'),
    body('is_available').optional().isBoolean().withMessage('is_available must be true or false'),
    body('is_featured').optional().isBoolean().withMessage('is_featured must be true or false'),
    body('price_change_reason').optional({ values: 'null' }).isString().isLength({ max: 300 }),
    ...(isCreate
      ? [body('stock_qty').optional().isInt({ min: 0, max: 1000000 }).withMessage('stock_qty must be 0 or more')]
      : []),
  ];
};

// ---------- Public ----------
router.get('/products', validate(listQuery), productController.listPublic);
router.get(
  '/products/:slug',
  validate([param('slug').isString().isLength({ min: 1, max: 180 })]),
  productController.getPublicBySlug,
);

// ---------- Admin ----------
const admin = [authMiddleware, requireRole(ROLE_GROUPS.CATALOGUE), auditContext];

router.get(
  '/admin/products',
  ...admin,
  validate([
    ...listQuery,
    query('available').optional().isBoolean(),
    query('lowStock').optional().isBoolean(),
  ]),
  productController.listAdmin,
);

router.post('/admin/products', ...admin, validate(productFields(true)), productController.create);

router.get('/admin/products/:id', ...admin, validate([idParam]), productController.getById);

router.put('/admin/products/:id', ...admin, validate([idParam, ...productFields(false)]), productController.update);

router.delete('/admin/products/:id', ...admin, validate([idParam]), productController.remove);

router.patch(
  '/admin/products/:id/stock',
  ...admin,
  validate([
    idParam,
    oneOf(
      [
        body('adjustment').exists().isInt({ min: -1000000, max: 1000000 }).not().equals('0'),
        body('quantity').exists().isInt({ min: 0, max: 1000000 }),
      ],
      { message: 'Send either "adjustment" (non-zero +/- whole number) or "quantity" (absolute, 0 or more)' },
    ),
    body('reason').isString().trim().notEmpty().withMessage('reason is required (e.g. restock, damaged, count correction)')
      .isLength({ max: 300 }),
  ]),
  productController.adjustStock,
);

router.post(
  '/admin/products/:id/image',
  ...admin,
  validate([idParam]),
  uploadProductImage,
  productController.uploadImage,
);

export default router;
