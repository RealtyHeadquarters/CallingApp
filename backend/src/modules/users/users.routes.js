import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/entitlement.js';
import { enforceLimit } from '../../middleware/enforceLimit.js';
import { validate } from '../../middleware/validate.js';
import {
  listUsers, listUsersQuery, getUser,
  createUser, createUserSchema,
  updateUser, updateUserSchema,
  deactivateUser, deleteUserPermanent,
  updateMyStatus, agentStatusSchema,
  updateMe, updateMeSchema,
} from './users.controller.js';

const router = Router();
router.use(authenticate);

// Self-service (any authenticated user)
router.patch('/me', validate(updateMeSchema), updateMe);
router.patch('/me/status', validate(agentStatusSchema), updateMyStatus);

// Admin/Manager management
router.get('/', requirePermission('user.view'), validate(listUsersQuery, 'query'), listUsers);
router.get('/:id', requirePermission('user.view'), getUser);
router.post('/', requirePermission('user.create'), enforceLimit('USERS'), validate(createUserSchema), createUser);
router.patch('/:id', requirePermission('user.edit'), validate(updateUserSchema), updateUser);
router.delete('/:id/permanent', requirePermission('user.delete'), deleteUserPermanent);
router.delete('/:id', requirePermission('user.delete'), deactivateUser);

export default router;
