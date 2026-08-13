import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  listTeams, getTeam,
  createTeam, createTeamSchema,
  updateTeam, updateTeamSchema,
} from './teams.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER'), listTeams);
router.get('/:id', requireRole('ADMIN', 'MANAGER'), getTeam);
router.post('/', requireRole('ADMIN'), validate(createTeamSchema), createTeam);
router.patch('/:id', requireRole('ADMIN'), validate(updateTeamSchema), updateTeam);

export default router;
