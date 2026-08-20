import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { isProd } from '../../config/env.js';
import { hashPassword, verifyPassword, signToken, publicUser } from './auth.service.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Login accepts either mobile number or email as the identifier (spec §4).
export const loginSchema = z.object({
  identifier: z.string().min(3, 'Enter your mobile number or email'),
  password: z.string().min(1, 'Password is required'),
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { mobile: identifier }] },
  });

  // Uniform error to avoid revealing which accounts exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is inactive');

  // Tag the login audit with the caller's tenant (there is no auth context yet).
  req.tenantId = user.tenantId || null;

  recordAudit(req, {
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    description: `${user.name} logged in`,
  });

  res.json({ token: signToken(user), user: publicUser(user) });
});

export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ user: publicUser(user) });
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.json({ success: true });
});

// Forgot password: issue a single-use, 30-min reset token. In production the raw
// token would be emailed/SMS'd; here (dev) we also return it so the flow is usable
// without an email provider. Always 200 so accounts can't be enumerated.
export const forgotPasswordSchema = z.object({
  identifier: z.string().min(3),
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { mobile: identifier }] },
    select: { id: true },
  });

  const response = {
    message: 'If an account exists for that identifier, reset instructions have been sent.',
  };

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    recordAudit(req, { action: 'FORGOT_PASSWORD', entityType: 'User', entityId: user.id, description: `Reset requested for ${identifier}` });
    // Dev convenience only — never expose the token in production.
    if (!isProd) response.resetToken = rawToken;
  }

  res.json(response);
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) throw ApiError.badRequest('Invalid or expired reset token');

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(newPassword) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Invalidate any other outstanding tokens for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  recordAudit(req, { action: 'RESET_PASSWORD', entityType: 'User', entityId: record.userId, description: 'Password reset via token' });
  res.json({ success: true });
});
