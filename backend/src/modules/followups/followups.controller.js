import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { assertOwnedId } from '../../utils/tenantScope.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { FOLLOWUP_TYPES, FOLLOWUP_STATUSES } from '../../utils/enums.js';

const followUpSelect = {
  id: true, followupAt: true, followupType: true, note: true, status: true, reminderSent: true,
  createdAt: true, updatedAt: true,
  client: { select: { id: true, leadId: true, name: true, mobile: true, company: true } },
  user: { select: { id: true, name: true } },
  callId: true,
};

function scopeForUser(user, where = {}) {
  if (user.role === 'AGENT') return { ...where, userId: user.id };
  if (user.role === 'MANAGER') return { ...where, user: { teamId: user.teamId ?? '__none__' } };
  return where;
}

// Resolve a quick option (spec §17) into an absolute timestamp.
function resolveQuick(quick) {
  const now = new Date();
  const d = new Date(now);
  switch (quick) {
    case '1hour': d.setHours(d.getHours() + 1); return d;
    case 'today': d.setHours(18, 0, 0, 0); return d;
    case 'tomorrow': d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d;
    case '2days': d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0); return d;
    case 'nextweek': d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d;
    default: return null;
  }
}

export const createSchema = z
  .object({
    clientId: z.string().min(1),
    callId: z.string().optional().nullable(),
    followupAt: z.coerce.date().optional(),
    quick: z.enum(['1hour', 'today', 'tomorrow', '2days', 'nextweek']).optional(),
    followupType: z.enum(FOLLOWUP_TYPES).default('CALL'),
    note: z.string().optional().nullable(),
  })
  .refine((d) => d.followupAt || d.quick, { message: 'Provide followupAt or a quick option' });

export const createFollowUp = asyncHandler(async (req, res) => {
  const b = req.body;
  const followupAt = b.followupAt || resolveQuick(b.quick);
  if (!followupAt) throw ApiError.badRequest('Invalid follow-up time');

  // Agents may only schedule follow-ups for their own leads.
  const clientWhere = req.user.role === 'AGENT'
    ? { id: b.clientId, assignedUserId: req.user.id }
    : { id: b.clientId };
  const client = await prisma.client.findFirst({ where: clientWhere, select: { id: true } });
  if (!client) throw ApiError.notFound('Lead not found');

  // A linked call (optional) must belong to this tenant.
  const callId = await assertOwnedId('call', b.callId, 'call');

  const followUp = await prisma.followUp.create({
    data: {
      clientId: b.clientId,
      callId,
      userId: req.user.id,
      followupAt,
      followupType: b.followupType,
      note: b.note || null,
    },
    select: followUpSelect,
  });
  recordAudit(req, { action: 'FOLLOWUP_SCHEDULED', entityType: 'FollowUp', entityId: followUp.id, description: `Follow-up on ${followupAt.toISOString()}` });
  res.status(201).json({ followUp });
});

export const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  scope: z.enum(['today', 'upcoming', 'overdue', 'completed', 'missed', 'all']).default('all'),
  userId: z.string().optional(),
  clientId: z.string().optional(),
});

export const listFollowUps = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let where = {};
  if (q.userId) where.userId = q.userId;
  if (q.clientId) where.clientId = q.clientId;

  switch (q.scope) {
    case 'today': where.status = 'PENDING'; where.followupAt = { gte: startOfToday, lte: endOfToday }; break;
    case 'upcoming': where.status = 'PENDING'; where.followupAt = { gt: endOfToday }; break;
    case 'overdue': where.status = 'PENDING'; where.followupAt = { lt: now }; break;
    case 'completed': where.status = 'COMPLETED'; break;
    case 'missed': where.status = 'MISSED'; break;
    default: break;
  }
  where = scopeForUser(req.user, where);

  const orderBy = q.scope === 'completed' || q.scope === 'missed'
    ? { followupAt: 'desc' }
    : { followupAt: 'asc' };

  const [rows, total] = await Promise.all([
    prisma.followUp.findMany({ where, select: followUpSelect, skip, take, orderBy }),
    prisma.followUp.count({ where }),
  ]);
  res.json(paginated(rows, total, { page, pageSize }));
});

export const updateSchema = z.object({
  status: z.enum(FOLLOWUP_STATUSES).optional(),
  followupAt: z.coerce.date().optional(),
  followupType: z.enum(FOLLOWUP_TYPES).optional(),
  note: z.string().optional().nullable(),
});

export const updateFollowUp = asyncHandler(async (req, res) => {
  const existing = await prisma.followUp.findFirst({ where: scopeForUser(req.user, { id: req.params.id }), select: { id: true } });
  if (!existing) throw ApiError.notFound('Follow-up not found');

  const followUp = await prisma.followUp.update({ where: { id: existing.id }, data: req.body, select: followUpSelect });
  res.json({ followUp });
});
