import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { assertOwnedId } from '../../utils/tenantScope.js';
import { generateLeadId } from '../../utils/ids.js';
import { computeCallStats } from '../../utils/stats.js';
import { notify } from '../../services/notifier.js';
import { LEAD_STATUSES } from '../../utils/enums.js';

const clientSelect = {
  id: true, leadId: true, name: true, mobile: true, alternateMobile: true,
  email: true, company: true, source: true, leadStatus: true,
  assignedUserId: true, assignedUser: { select: { id: true, name: true } },
  teamId: true, createdAt: true, updatedAt: true,
};

// Agents are scoped to leads assigned to them (spec §47 — no cross-user access).
function scopeForUser(user, where = {}) {
  if (user.role === 'AGENT') return { ...where, assignedUserId: user.id };
  if (user.role === 'MANAGER') return { ...where, teamId: user.teamId ?? '__none__' };
  return where; // ADMIN
}

export const listLeadsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  assignedUserId: z.string().optional(),
  teamId: z.string().optional(),
  search: z.string().optional(), // matches name, mobile, email, leadId, company (spec §24)
});

export const listLeads = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q);

  let where = {};
  if (q.leadStatus) where.leadStatus = q.leadStatus;
  if (q.assignedUserId) where.assignedUserId = q.assignedUserId;
  if (q.teamId) where.teamId = q.teamId;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { mobile: { contains: q.search } },
      { email: { contains: q.search, mode: 'insensitive' } },
      { leadId: { contains: q.search, mode: 'insensitive' } },
      { company: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  where = scopeForUser(req.user, where);

  const [rows, total] = await Promise.all([
    prisma.client.findMany({ where, select: clientSelect, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);
  res.json(paginated(rows, total, { page, pageSize }));
});

// Contact lookup by phone number (spec §7).
export const lookup = asyncHandler(async (req, res) => {
  const number = String(req.query.number || '').trim();
  if (!number) throw ApiError.badRequest('number query param is required');

  const client = await prisma.client.findFirst({
    where: scopeForUser(req.user, { mobile: number }),
    select: {
      ...clientSelect,
      calls: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { callStatus: true, remark: true, disposition: true, createdAt: true },
      },
      followUps: {
        where: { status: 'PENDING' },
        orderBy: { followupAt: 'asc' },
        take: 1,
        select: { followupAt: true, followupType: true, note: true },
      },
    },
  });

  if (!client) return res.json({ found: false });

  const stats = await computeCallStats(prisma, { clientId: client.id });
  const { calls, followUps, ...rest } = client;
  res.json({
    found: true,
    client: {
      ...rest,
      stats,
      lastCall: calls[0] || null,
      nextFollowUp: followUps[0] || null,
    },
  });
});

// Full CRM profile + timeline (spec §19, §20).
export const getLead = asyncHandler(async (req, res) => {
  const client = await prisma.client.findFirst({
    where: scopeForUser(req.user, { id: req.params.id }),
    select: clientSelect,
  });
  if (!client) throw ApiError.notFound('Lead not found');

  const [stats, timeline, followUps] = await Promise.all([
    computeCallStats(prisma, { clientId: client.id }),
    prisma.call.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, callId: true, callStatus: true, disposition: true, remark: true,
        durationSeconds: true, callStartTime: true, callEndTime: true, createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.followUp.findMany({
      where: { clientId: client.id },
      orderBy: { followupAt: 'desc' },
      take: 50,
    }),
  ]);

  res.json({ client: { ...client, stats }, timeline, followUps });
});

export const createLeadSchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(6),
  alternateMobile: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  company: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  assignedUserId: z.string().optional().nullable(),
  teamId: z.string().optional().nullable(),
});

export const createLead = asyncHandler(async (req, res) => {
  const body = req.body;
  // Client-supplied FKs must belong to this tenant (blocks cross-tenant links/leaks).
  const assignedUserId = await assertOwnedId('user', body.assignedUserId, 'agent');
  const teamId = await assertOwnedId('team', body.teamId, 'team');
  const leadId = await generateLeadId();
  const client = await prisma.client.create({
    data: {
      leadId,
      name: body.name,
      mobile: body.mobile,
      alternateMobile: body.alternateMobile || null,
      email: body.email || null,
      company: body.company || null,
      source: body.source || null,
      leadStatus: body.leadStatus || (assignedUserId ? 'ASSIGNED' : 'NEW'),
      assignedUserId,
      teamId,
    },
    select: clientSelect,
  });
  recordAudit(req, { action: 'CREATE', entityType: 'Client', entityId: client.id, description: `Created lead ${client.name}` });
  res.status(201).json({ client });
});

export const updateLeadSchema = createLeadSchema.partial();

export const updateLead = asyncHandler(async (req, res) => {
  // Ensure the caller may touch this lead.
  const existing = await prisma.client.findFirst({ where: scopeForUser(req.user, { id: req.params.id }), select: { id: true } });
  if (!existing) throw ApiError.notFound('Lead not found');

  // Re-validate any reassignment FKs against this tenant before writing them.
  const data = { ...req.body };
  if ('assignedUserId' in data) data.assignedUserId = await assertOwnedId('user', data.assignedUserId, 'agent');
  if ('teamId' in data) data.teamId = await assertOwnedId('team', data.teamId, 'team');

  const client = await prisma.client.update({ where: { id: req.params.id }, data, select: clientSelect });
  recordAudit(req, { action: 'UPDATE', entityType: 'Client', entityId: client.id, description: `Updated lead ${client.name}` });
  res.json({ client });
});

// Assign / reassign a lead (spec §22).
export const assignLeadSchema = z.object({
  assignedUserId: z.string().min(1),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
});

export const assignLead = asyncHandler(async (req, res) => {
  const agent = await prisma.user.findUnique({ where: { id: req.body.assignedUserId }, select: { id: true, teamId: true, name: true } });
  if (!agent) throw ApiError.badRequest('Assigned user does not exist');

  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      assignedUserId: agent.id,
      teamId: agent.teamId ?? undefined,
      leadStatus: req.body.leadStatus || 'ASSIGNED',
    },
    select: clientSelect,
  });
  recordAudit(req, { action: 'ASSIGN', entityType: 'Client', entityId: client.id, description: `Assigned ${client.name} to ${agent.name}` });
  await notify({
    userId: agent.id,
    type: 'LEAD_ASSIGNED',
    title: `New lead assigned: ${client.name}`,
    body: client.company || client.mobile,
    entityType: 'Client',
    entityId: client.id,
  });
  res.json({ client });
});
