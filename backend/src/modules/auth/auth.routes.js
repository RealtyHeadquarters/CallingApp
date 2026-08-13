import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  login,
  loginSchema,
  me,
  changePassword,
  changePasswordSchema,
  forgotPassword,
  forgotPasswordSchema,
  resetPassword,
  resetPasswordSchema,
} from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

export default router;
