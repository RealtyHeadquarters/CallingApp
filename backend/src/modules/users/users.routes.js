import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  listUsers, listUsersQuery, getUser,
  createUser, createUserSchema,
  updateUser, updateUserSchema,
  deactivateUser,
  updateMyStatus, agentStatusSchema,
  updateMe, updateMeSchema,
} from './users.controller.js';

const router = Router();
router.use(authenticate);

// Self-service (any authenticated user)
router.patch('/me', validate(updateMeSchema), updateMe);
router.patch('/me/status', validate(agentStatusSchema), updateMyStatus);

// Admin/Manager management
router.get('/', requireRole('ADMIN', 'MANAGER'), validate(listUsersQuery, 'query'), listUsers);
router.get('/:id', requireRole('ADMIN', 'MANAGER'), getUser);
router.post('/', requireRole('ADMIN'), validate(createUserSchema), createUser);
router.patch('/:id', requireRole('ADMIN'), validate(updateUserSchema), updateUser);
router.delete('/:id', requireRole('ADMIN'), deactivateUser);

export default router;
