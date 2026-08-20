import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  platformStats,
  listTenants, listTenantsQuery,
  getTenant,
  createTenant, createTenantSchema,
  updateTenant, updateTenantSchema,
  setTenantStatus, setTenantStatusSchema,
  createTenantUser, createTenantUserSchema,
  resetTenantUserPassword, resetUserPasswordSchema,
  listPlans, createPlan, createPlanSchema, updatePlan, updatePlanSchema,
  assignPlan, assignPlanSchema, startTrial, startTrialSchema,
  extendSubscription, extendSchema, cancelSubscription,
  listFeatures, setTenantFeatures, setTenantFeaturesSchema,
  listTenantPayments, listTenantAudit,
} from './admin.controller.js';

const router = Router();

// Platform-owner surface. Every route requires the SUPER_ADMIN role; this is the
// only place tenant scoping is intentionally bypassed.
router.use(authenticate, requireRole('SUPER_ADMIN'));

router.get('/stats', platformStats);

router.get('/tenants', validate(listTenantsQuery, 'query'), listTenants);
router.post('/tenants', validate(createTenantSchema), createTenant);
router.get('/tenants/:id', getTenant);
router.patch('/tenants/:id', validate(updateTenantSchema), updateTenant);
router.patch('/tenants/:id/status', validate(setTenantStatusSchema), setTenantStatus);

router.post('/tenants/:id/users', validate(createTenantUserSchema), createTenantUser);
router.patch('/tenants/:id/users/:userId/password', validate(resetUserPasswordSchema), resetTenantUserPassword);

// Feature catalog + per-tenant feature overrides
router.get('/features', listFeatures);
router.patch('/tenants/:id/features', validate(setTenantFeaturesSchema), setTenantFeatures);

// Plan catalog
router.get('/plans', listPlans);
router.post('/plans', validate(createPlanSchema), createPlan);
router.patch('/plans/:id', validate(updatePlanSchema), updatePlan);

// Per-tenant subscription lifecycle
router.put('/tenants/:id/subscription', validate(assignPlanSchema), assignPlan);
router.post('/tenants/:id/subscription/trial', validate(startTrialSchema), startTrial);
router.post('/tenants/:id/subscription/extend', validate(extendSchema), extendSubscription);
router.post('/tenants/:id/subscription/cancel', cancelSubscription);
router.get('/tenants/:id/payments', listTenantPayments);
router.get('/tenants/:id/audit', listTenantAudit);

export default router;
