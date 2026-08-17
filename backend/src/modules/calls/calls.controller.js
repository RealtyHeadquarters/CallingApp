import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { generateCallId, generateLeadId } from '../../utils/ids.js';
import { formatDuration, dateRangeFromPreset } from '../../utils/stats.js';
import { CALL_STATUSES, DISPOSITIONS, LEAD_STATUSES } from '../../utils/enums.js';

const callSelect = {
  id: true, callId: true, phoneNumber: true, customerName: true, callStatus: true, disposition: true,
  remark: true, recordingUrl: true, durationSeconds: true,
  callStartTime: true, callAnswerTime: true, callEndTime: true,
  createdAt: true, updatedAt: true,
  user: { select: { id: true, name: true } },
  client: { select: { id: true, leadId: true, name: true, company: true, leadStatus: true } },
};

function scopeForUser(user, where = {}) {
  if (user.role === 'AGENT') return { ...where, userId: user.id };
  if (user.role === 'MANAGER') return { ...where, user: { teamId: user.teamId ?? '__none__' } };
  return where;
}

// Try to associate a dialed number with a known lead in the agent's scope.
async function resolveClientId(user, phoneNumber, providedClientId) {
  if (providedClientId) return providedClientId;
  const match = await prisma.client.findFirst({ where: { mobile: phoneNumber }, select: { id: true } });
  return match?.id ?? null;
}

// ── Initiate a call (agent taps CALL; SIM dialer starts) — spec §8/§18 ──
export const initiateSchema = z.object({
  phoneNumber: z.string().min(3),
  clientId: z.string().optional().nullable(),
  callStartTime: z.coerce.date().optional(),
});

export const initiateCall = asyncHandler(async (req, res) => {
  const { phoneNumber } = req.body;
  const clientId = await resolveClientId(req.user, phoneNumber, req.body.clientId);
  const callId = await generateCallId();

  const call = await prisma.call.create({
    data: {
      callId,
      userId: req.user.id,
      clientId,
      phoneNumber,
      callStartTime: req.body.callStartTime || new Date(),
    },
    select: callSelect,
  });

  // Presence: Available -> On Call (spec §37).
  await prisma.user.update({ where: { id: req.user.id }, data: { agentStatus: 'ON_CALL' } });

  recordAudit(req, { action: 'CALL_INITIATED', entityType: 'Call', entityId: call.id, description: `Call ${callId} to ${phoneNumber}` });
  res.status(201).json({ call });
});

// ── Complete a call with real outcome from the device call log — spec §10/§11 ──
export const completeSchema = z
  .object({
    callStatus: z.enum(CALL_STATUSES),
    callAnswerTime: z.coerce.date().optional().nullable(),
    callEndTime: z.coerce.date().optional().nullable(),
    durationSeconds: z.number().int().min(0).optional(),
  })
  .refine((d) => d.callStatus !== 'ANSWERED' || (d.durationSeconds ?? 0) >= 0, {
    message: 'Answered calls require a duration',
  });

export const completeCall = asyncHandler(async (req, res) => {
  const call = await prisma.call.findFirst({ where: scopeForUser(req.user, { id: req.params.id }), select: { id: true, userId: true } });
  if (!call) throw ApiError.notFound('Call not found');

  const answered = req.body.callStatus === 'ANSWERED';
  // Only answered calls carry talk time (spec §11).
  const durationSeconds = answered ? req.body.durationSeconds ?? 0 : 0;

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      callStatus: req.body.callStatus,
      callAnswerTime: answered ? req.body.callAnswerTime ?? null : null,
      callEndTime: req.body.callEndTime ?? new Date(),
      durationSeconds,
    },
    select: callSelect,
  });

  // On Call -> Available (spec §37).
  await prisma.user.update({ where: { id: call.userId }, data: { agentStatus: 'AVAILABLE' } });

  res.json({ call: updated });
});

// ── One-shot log for SIM flow: create a fully-formed record from call-log data ──
export const logCallSchema = z.object({
  phoneNumber: z.string().min(3),
  clientId: z.string().optional().nullable(),
  callStatus: z.enum(CALL_STATUSES),
  callStartTime: z.coerce.date().optional(),
  callAnswerTime: z.coerce.date().optional().nullable(),
  callEndTime: z.coerce.date().optional().nullable(),
  durationSeconds: z.number().int().min(0).optional(),
});

export const logCall = asyncHandler(async (req, res) => {
  const b = req.body;
  const clientId = await resolveClientId(req.user, b.phoneNumber, b.clientId);
  const callId = await generateCallId();
  const answered = b.callStatus === 'ANSWERED';

  const call = await prisma.call.create({
    data: {
      callId,
      userId: req.user.id,
      clientId,
      phoneNumber: b.phoneNumber,
      callStatus: b.callStatus,
      callStartTime: b.callStartTime || new Date(),
      callAnswerTime: answered ? b.callAnswerTime ?? null : null,
      callEndTime: b.callEndTime ?? new Date(),
      durationSeconds: answered ? b.durationSeconds ?? 0 : 0,
    },
    select: callSelect,
  });
  recordAudit(req, { action: 'CALL_LOGGED', entityType: 'Call', entityId: call.id, description: `Logged ${callId} (${b.callStatus})` });
  res.status(201).json({ call });
});

// ── Disposition + mandatory remark, optional follow-up lead-status change (spec §14/§15) ──
export const dispositionSchema = z.object({
  disposition: z.enum(DISPOSITIONS),
  remark: z.string().min(1, 'Remark is required'),
  customerName: z.string().trim().optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
});

export const setDisposition = asyncHandler(async (req, res) => {
  const call = await prisma.call.findFirst({
    where: scopeForUser(req.user, { id: req.params.id }),
    select: { id: true, clientId: true, phoneNumber: true, userId: true },
  });
  if (!call) throw ApiError.notFound('Call not found');

  const customerName = req.body.customerName?.trim() || null;

  // If the agent named an unknown number, create/link a lead so the call becomes
  // a CRM contact (spec §53). Existing leads are matched by phone to avoid dupes.
  let clientId = call.clientId;
  if (customerName && !clientId) {
    const existing = await prisma.client.findFirst({ where: { mobile: call.phoneNumber }, select: { id: true } });
    if (existing) {
      clientId = existing.id;
      await prisma.client.update({ where: { id: existing.id }, data: { name: customerName } });
    } else {
      const leadId = await generateLeadId();
      const created = await prisma.client.create({
        data: {
          leadId,
          name: customerName,
          mobile: call.phoneNumber,
          source: 'Call',
          leadStatus: 'CONTACTED',
          assignedUserId: call.userId,
        },
        select: { id: true },
      });
      clientId = created.id;
    }
  } else if (customerName && clientId) {
    await prisma.client.update({ where: { id: clientId }, data: { name: customerName } });
  }

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      disposition: req.body.disposition,
      remark: req.body.remark,
      customerName,
      ...(clientId && clientId !== call.clientId ? { clientId } : {}),
    },
    select: callSelect,
  });

  // Optionally advance the lead's status (spec §53 — call becomes CRM activity).
  if (req.body.leadStatus && clientId) {
    await prisma.client.update({ where: { id: clientId }, data: { leadStatus: req.body.leadStatus } });
  }

  recordAudit(req, { action: 'CALL_DISPOSITION', entityType: 'Call', entityId: call.id, description: `${req.body.disposition}` });
  res.json({ call: updated });
});

// ── Call history with filters (spec §12/§30/§31) ──
export const listCallsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  userId: z.string().optional(),
  clientId: z.string().optional(),
  callStatus: z.enum(CALL_STATUSES).optional(),
  disposition: z.enum(DISPOSITIONS).optional(),
  datePreset: z.enum(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
});

export const listCalls = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q);

  let where = {};
  if (q.userId) where.userId = q.userId;
  if (q.clientId) where.clientId = q.clientId;
  if (q.callStatus) where.callStatus = q.callStatus;
  if (q.disposition) where.disposition = q.disposition;
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  if (range) where.createdAt = range;
  if (q.search) {
    where.OR = [
      { phoneNumber: { contains: q.search } },
      { callId: { contains: q.search, mode: 'insensitive' } },
      { customerName: { contains: q.search, mode: 'insensitive' } },
      { client: { name: { contains: q.search, mode: 'insensitive' } } },
    ];
  }
  where = scopeForUser(req.user, where);

  const [rows, total] = await Promise.all([
    prisma.call.findMany({ where, select: callSelect, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.call.count({ where }),
  ]);

  const data = rows.map((c) => ({ ...c, durationFormatted: formatDuration(c.durationSeconds) }));
  res.json(paginated(data, total, { page, pageSize }));
});

export const getCall = asyncHandler(async (req, res) => {
  const call = await prisma.call.findFirst({
    where: scopeForUser(req.user, { id: req.params.id }),
    select: { ...callSelect, followUps: true },
  });
  if (!call) throw ApiError.notFound('Call not found');
  res.json({ call: { ...call, durationFormatted: formatDuration(call.durationSeconds) } });
});
