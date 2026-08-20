import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  billingConfig,
  createOrderHandler, createOrderSchema,
  verifyPaymentHandler, verifyPaymentSchema,
  listMyPayments,
} from './billing.controller.js';

const router = Router();
router.use(authenticate);

// Purchasing is a Client-Admin action. These routes stay usable when the tenant
// is read-only/expired (see ALWAYS_ALLOWED in auth) so they can pay to renew.
router.get('/config', billingConfig);
router.get('/payments', requireRole('ADMIN'), listMyPayments);
router.post('/order', requireRole('ADMIN'), validate(createOrderSchema), createOrderHandler);
router.post('/verify', requireRole('ADMIN'), validate(verifyPaymentSchema), verifyPaymentHandler);

export default router;
