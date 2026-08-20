import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/entitlement.js';
import { validate } from '../../middleware/validate.js';
import {
  listTeams, getTeam,
  createTeam, createTeamSchema,
  updateTeam, updateTeamSchema,
} from './teams.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('team.view'), listTeams);
router.get('/:id', requirePermission('team.view'), getTeam);
router.post('/', requirePermission('team.manage'), validate(createTeamSchema), createTeam);
router.patch('/:id', requirePermission('team.manage'), validate(updateTeamSchema), updateTeam);

export default router;
