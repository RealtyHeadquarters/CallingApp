import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireFeature } from '../../middleware/entitlement.js';
import { validate } from '../../middleware/validate.js';
import { userPerformance, teamPerformance, analytics, rangeQuery } from './reports.controller.js';

const router = Router();
router.use(authenticate, requireFeature('ADVANCED_REPORTS'), requirePermission('report.view'));

router.get('/user-performance', validate(rangeQuery, 'query'), userPerformance);
router.get('/team-performance', validate(rangeQuery, 'query'), teamPerformance);
router.get('/analytics', validate(rangeQuery, 'query'), analytics);

export default router;
