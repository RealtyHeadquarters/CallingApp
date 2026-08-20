import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/entitlement.js';
import { validate } from '../../middleware/validate.js';
import {
  initiateCall, initiateSchema,
  completeCall, completeSchema,
  logCall, logCallSchema,
  syncCalls, syncCallsSchema,
  manualLogCall, manualLogSchema,
  setDisposition, dispositionSchema,
  listCalls, listCallsQuery,
  getCall,
} from './calls.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', validate(listCallsQuery, 'query'), listCalls);
router.get('/:id', getCall);

router.post('/', validate(initiateSchema), initiateCall);           // initiate (spec §8)
router.post('/log', validate(logCallSchema), logCall);             // SIM one-shot log
router.post('/sync', validate(syncCallsSchema), syncCalls);        // batch call-log sync (incoming + outgoing)
router.post('/manual', requirePermission('call.manual'), validate(manualLogSchema), manualLogCall); // manual CRM entry
router.patch('/:id/complete', validate(completeSchema), completeCall); // outcome (spec §10)
router.patch('/:id/disposition', validate(dispositionSchema), setDisposition); // spec §14/§15

export default router;
