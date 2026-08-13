import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db, COL, Timestamp } from '../admin.js';
import { getById, findOne, create, update } from '../lib/repo.js';
import { ApiError, asyncHandler, validate } from '../lib/framework.js';
import { hashPassword, verifyPassword, signToken, publicUser, authenticate } from '../auth.js';

const router = Router();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isProd = process.env.NODE_ENV === 'production' && !process.env.FUNCTIONS_EMULATOR;

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const id = identifier.toLowerCase();
  const user =
    (await findOne(COL.users, (c) => c.where('email', '==', id))) ||
    (await findOne(COL.users, (c) => c.where('mobile', '==', identifier)));

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is inactive');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await getById(COL.users, req.user.id);
  res.json({ user: publicUser(user) });
}));

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/change-password', authenticate, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const user = await getById(COL.users, req.user.id);
  if (!(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await update(COL.users, user.id, { passwordHash: await hashPassword(req.body.newPassword) });
  res.json({ success: true });
}));

const forgotSchema = z.object({ identifier: z.string().min(3) });

router.post('/forgot-password', validate(forgotSchema), asyncHandler(async (req, res) => {
  const { identifier } = req.body;
  const id = identifier.toLowerCase();
  const user =
    (await findOne(COL.users, (c) => c.where('email', '==', id))) ||
    (await findOne(COL.users, (c) => c.where('mobile', '==', identifier)));

  const response = { message: 'If an account exists for that identifier, reset instructions have been sent.' };
  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');
    await create(COL.resetTokens, {
      userId: user.id,
      tokenHash: sha256(raw),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 60_000)),
      usedAt: null,
    });
    if (!isProd) response.resetToken = raw;
  }
  res.json(response);
}));

const resetSchema = z.object({ token: z.string().min(10), newPassword: z.string().min(8) });

router.post('/reset-password', validate(resetSchema), asyncHandler(async (req, res) => {
  const record = await findOne(COL.resetTokens, (c) =>
    c.where('tokenHash', '==', sha256(req.body.token)).where('usedAt', '==', null));
  if (!record || new Date(record.expiresAt) < new Date()) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }
  await update(COL.users, record.userId, { passwordHash: await hashPassword(req.body.newPassword) });
  await update(COL.resetTokens, record.id, { usedAt: Timestamp.now() });
  res.json({ success: true });
}));

export default router;
