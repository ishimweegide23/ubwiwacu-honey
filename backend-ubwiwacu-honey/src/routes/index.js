import { Router } from 'express';
import authRoutes from './auth.routes.js';
import productRoutes from './product.routes.js';
import orderRoutes from './order.routes.js';
import paymentRoutes from './payment.routes.js';
import webhookRoutes from './webhook.routes.js';
import receiptRoutes from './receipt.routes.js';
import posRoutes from './pos.routes.js';
import analyticsRoutes from './analytics.routes.js';
import reportRoutes from './report.routes.js';
import locationRoutes from './location.routes.js';
import customerRoutes from './customer.routes.js';
import searchRoutes from './search.routes.js';
import momoRoutes from './momo.routes.js';

/**
 * Every router declares its full path below /api, e.g. "/products" and "/admin/products",
 * so public and admin endpoints of one module live in one file.
 * Order matters only where paths overlap: payment/receipt sub-routes of /orders/:orderNumber
 * are more specific than GET /orders/:orderNumber, so they never collide.
 */
const router = Router();

router.use(authRoutes);
router.use(productRoutes);
router.use(orderRoutes);
router.use(paymentRoutes);
router.use(webhookRoutes);
router.use(receiptRoutes);
router.use(posRoutes);
router.use(analyticsRoutes);
router.use(reportRoutes);
router.use(locationRoutes);
router.use(customerRoutes);
router.use(searchRoutes);
router.use(momoRoutes);

export default router;
