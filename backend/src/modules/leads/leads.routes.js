import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  listLeads, listLeadsQuery, lookup, getLead,
  createLead, createLeadSchema,
  updateLead, updateLeadSchema,
  assignLead, assignLeadSchema,
} from './leads.controller.js';
import { importLeads } from './leads.import.js';
import { myQueue } from './leads.queue.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

router.get('/lookup', lookup);       // contact lookup by ?number= (spec §7)
router.get('/queue', myQueue);       // Call Next queue (spec §38)
router.get('/', validate(listLeadsQuery, 'query'), listLeads);
router.get('/:id', getLead);

router.post('/', requireRole('ADMIN', 'MANAGER'), validate(createLeadSchema), createLead);
router.post('/import', requireRole('ADMIN', 'MANAGER'), upload.single('file'), importLeads);
router.patch('/:id', validate(updateLeadSchema), updateLead);
router.patch('/:id/assign', requireRole('ADMIN', 'MANAGER'), validate(assignLeadSchema), assignLead);

export default router;
