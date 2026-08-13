import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { userPerformance, teamPerformance, analytics, rangeQuery } from './reports.controller.js';

const router = Router();
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

router.get('/user-performance', validate(rangeQuery, 'query'), userPerformance);
router.get('/team-performance', validate(rangeQuery, 'query'), teamPerformance);
router.get('/analytics', validate(rangeQuery, 'query'), analytics);

export default router;
