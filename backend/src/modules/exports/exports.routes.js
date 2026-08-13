import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { exportCalls, exportLeads, exportUserPerformance } from './exports.controller.js';

const router = Router();
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

router.get('/calls', exportCalls);
router.get('/leads', exportLeads);
router.get('/user-performance', exportUserPerformance);

export default router;
