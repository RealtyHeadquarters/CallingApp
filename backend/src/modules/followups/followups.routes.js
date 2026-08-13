import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createFollowUp, createSchema,
  listFollowUps, listQuery,
  updateFollowUp, updateSchema,
} from './followups.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', validate(listQuery, 'query'), listFollowUps);
router.post('/', validate(createSchema), createFollowUp);
router.patch('/:id', validate(updateSchema), updateFollowUp);

export default router;
