import { Router } from 'express';
import { z } from 'zod';
import { db, COL } from '../admin.js';
import { getById, findOne, create, update } from '../lib/repo.js';
import { listDocs } from '../lib/list.js';
import { ApiError, asyncHandler, validate, parsePagination } from '../lib/framework.js';
import { authenticate, requireRole, hashPassword, publicUser } from '../auth.js';
import { ROLES, ACCOUNT_STATUSES, AGENT_STATUSES } from '../lib/enums.js';

const router = Router();
router.use(authenticate);

// Attach team name; strip password hash.
async function shape(user) {
  if (!user) return null;
  const u = publicUser(user);
  if (u.teamId) {
    const team = await getById(COL.teams, u.teamId);
    u.team = team ? { id: team.id, name: team.name } : null;
  } else u.team = null;
  return u;
}

// ── Self-service ──
router.patch('/me', validate(z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().transform((s) => s.toLowerCase()).optional(),
})), asyncHandler(async (req, res) => {
  const user = await update(COL.users, req.user.id, req.body);
  res.json({ user: await shape(user) });
}));

router.patch('/me/status', validate(z.object({ agentStatus: z.enum(AGENT_STATUSES) })), asyncHandler(async (req, res) => {
  const user = await update(COL.users, req.user.id, { agentStatus: req.body.agentStatus });
  res.json({ user: await shape(user) });
}));

// ── Admin/Manager ──
const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  teamId: z.string().optional(),
  search: z.string().optional(),
});

router.get('/', requireRole('ADMIN', 'MANAGER'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, offset } = parsePagination(q);
  const teamFilter = req.user.role === 'MANAGER' ? (req.user.teamId ?? '__none__') : q.teamId;

  const result = await listDocs({
    collectionRef: db.collection(COL.users),
    baseQuery: (c) => {
      let query = c;
      if (q.role) query = query.where('role', '==', q.role);
      if (q.status) query = query.where('status', '==', q.status);
      if (teamFilter) query = query.where('teamId', '==', teamFilter);
      return query;
    },
    page, pageSize, offset, search: q.search, searchFields: ['name', 'email', 'mobile'],
  });
  result.data = await Promise.all(result.data.map(shape));
  res.json(result);
}));

router.get('/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const user = await getById(COL.users, req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user: await shape(user) });
}));

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  mobile: z.string().min(6),
  password: z.string().min(8),
  role: z.enum(ROLES).default('AGENT'),
  teamId: z.string().nullable().optional(),
  dailyCallTarget: z.number().int().positive().nullable().optional(),
  dailyTalktimeTarget: z.number().int().positive().nullable().optional(),
});

router.post('/', requireRole('ADMIN'), validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  // Enforce unique email/mobile (Firestore has no unique constraint).
  if (await findOne(COL.users, (c) => c.where('email', '==', b.email))) throw ApiError.badRequest('Email already in use');
  if (await findOne(COL.users, (c) => c.where('mobile', '==', b.mobile))) throw ApiError.badRequest('Mobile already in use');

  const user = await create(COL.users, {
    name: b.name, email: b.email, mobile: b.mobile,
    passwordHash: await hashPassword(b.password),
    role: b.role, status: 'ACTIVE', agentStatus: 'OFFLINE',
    teamId: b.teamId || null,
    dailyCallTarget: b.dailyCallTarget ?? null,
    dailyTalktimeTarget: b.dailyTalktimeTarget ?? null,
  });
  res.status(201).json({ user: await shape(user) });
}));

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  teamId: z.string().nullable().optional(),
  dailyCallTarget: z.number().int().positive().nullable().optional(),
  dailyTalktimeTarget: z.number().int().positive().nullable().optional(),
  password: z.string().min(8).optional(),
});

router.patch('/:id', requireRole('ADMIN'), validate(updateSchema), asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (data.password) { data.passwordHash = await hashPassword(data.password); delete data.password; }
  const user = await update(COL.users, req.params.id, data);
  res.json({ user: await shape(user) });
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const user = await update(COL.users, req.params.id, { status: 'INACTIVE', agentStatus: 'OFFLINE' });
  res.json({ user: await shape(user) });
}));

export default router;
