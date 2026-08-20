import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireFeature } from '../../middleware/entitlement.js';
import { exportCalls, exportLeads, exportUserPerformance } from './exports.controller.js';

const router = Router();
router.use(authenticate, requireFeature('EXPORT'), requirePermission('report.export'));

router.get('/calls', exportCalls);
router.get('/leads', exportLeads);
router.get('/user-performance', exportUserPerformance);

export default router;
