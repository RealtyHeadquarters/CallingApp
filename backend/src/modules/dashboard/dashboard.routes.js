import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { agentDashboard, adminDashboard } from './dashboard.controller.js';

const router = Router();
router.use(authenticate);

router.get('/agent', agentDashboard);
router.get('/admin', requireRole('ADMIN', 'MANAGER'), adminDashboard);

export default router;
