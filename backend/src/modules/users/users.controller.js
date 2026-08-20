import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { hashPassword, publicUser } from '../auth/auth.service.js';
import { ROLES, ACCOUNT_STATUSES, AGENT_STATUSES } from '../../utils/enums.js';

const userSelect = {
  id: true, name: true, email: true, mobile: true, role: true, status: true,
  agentStatus: true, dailyCallTarget: true, dailyTalktimeTarget: true,
  teamId: true, team: { select: { id: true, name: true } },
  createdAt: true, updatedAt: true,
};

export const listUsersQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  teamId: z.string().optional(),
  search: z.string().optional(),
});

export const listUsers = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q);

  const where = {};
  if (q.role) where.role = q.role;
  if (q.status) where.status = q.status;
  if (q.teamId) where.teamId = q.teamId;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
      { mobile: { contains: q.search } },
    ];
  }

  // Managers can only see users in their own team.
  if (req.user.role === 'MANAGER') where.teamId = req.user.teamId ?? '__none__';

  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where }),
  ]);
  res.json(paginated(rows, total, { page, pageSize }));
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user });
});

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  mobile: z.string().min(6),
  password: z.string().min(8),
  role: z.enum(ROLES).default('AGENT'),
  teamId: z.string().optional().nullable(),
  dailyCallTarget: z.number().int().positive().optional().nullable(),
  dailyTalktimeTarget: z.number().int().positive().optional().nullable(),
});

export const createUser = asyncHandler(async (req, res) => {
  const body = req.body;
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      mobile: body.mobile,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      teamId: body.teamId || null,
      dailyCallTarget: body.dailyCallTarget ?? null,
      dailyTalktimeTarget: body.dailyTalktimeTarget ?? null,
    },
    select: userSelect,
  });
  recordAudit(req, { action: 'CREATE', entityType: 'User', entityId: user.id, description: `Created user ${user.name}` });
  res.status(201).json({ user });
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().transform((s) => s.toLowerCase()).optional(),
  mobile: z.string().min(6).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  teamId: z.string().nullable().optional(),
  dailyCallTarget: z.number().int().positive().nullable().optional(),
  dailyTalktimeTarget: z.number().int().positive().nullable().optional(),
  password: z.string().min(8).optional(),
});

export const updateUser = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.password) {
    body.passwordHash = await hashPassword(body.password);
    delete body.password;
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: body,
    select: userSelect,
  });
  recordAudit(req, { action: 'UPDATE', entityType: 'User', entityId: user.id, description: `Updated user ${user.name}` });
  res.json({ user });
});

export const deactivateUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: 'INACTIVE', agentStatus: 'OFFLINE' },
    select: userSelect,
  });
  recordAudit(req, { action: 'DEACTIVATE', entityType: 'User', entityId: user.id, description: `Deactivated ${user.name}` });
  res.json({ user });
});

// Permanently delete a user and all their activity data. Cascade (schema) removes
// their calls, follow-ups, notifications & reset tokens; their leads become
// unassigned (assignedUserId → null) rather than deleted, and audit logs are kept
// with a null user. Irreversible.
export const deleteUserPermanent = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot delete your own account');

  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!target) throw ApiError.notFound('User not found');

  const [calls, followUps] = await Promise.all([
    prisma.call.count({ where: { userId: target.id } }),
    prisma.followUp.count({ where: { userId: target.id } }),
  ]);

  await prisma.user.delete({ where: { id: target.id } });

  recordAudit(req, {
    action: 'DELETE_PERMANENT',
    entityType: 'User',
    entityId: target.id,
    description: `Permanently deleted ${target.name} (${calls} calls, ${followUps} follow-ups removed)`,
  });
  res.json({ success: true, deleted: { calls, followUps } });
});

// Agents update their own presence (spec §37).
export const agentStatusSchema = z.object({ agentStatus: z.enum(AGENT_STATUSES) });

export const updateMyStatus = asyncHandler(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { agentStatus: req.body.agentStatus },
    select: userSelect,
  });
  res.json({ user });
});

// Self profile update (spec §44 Profile) — limited fields.
export const updateMeSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().transform((s) => s.toLowerCase()).optional(),
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.user.id }, data: req.body, select: userSelect });
  res.json({ user });
});
