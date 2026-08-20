import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/entitlement.js';
import { validate } from '../../middleware/validate.js';
import { listAudit, listAuditQuery } from './audit.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('audit.view'), validate(listAuditQuery, 'query'), listAudit);

export default router;
