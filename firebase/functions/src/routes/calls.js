import { Router } from 'express';
import { z } from 'zod';
import { db, COL } from '../admin.js';
import { getById, findOne, create, update, ts } from '../lib/repo.js';
import { listDocs } from '../lib/list.js';
import { ApiError, asyncHandler, validate, parsePagination } from '../lib/framework.js';
import { authenticate } from '../auth.js';
import { generateCallId } from '../lib/ids.js';
import { formatDuration, dateRangeFromPreset } from '../lib/stats.js';
import { CALL_STATUSES, DISPOSITIONS, LEAD_STATUSES } from '../lib/enums.js';

const router = Router();
router.use(authenticate);

// Team member ids for manager scoping (Firestore 'in' supports up to 30).
async function teamMemberIds(teamId) {
  const snap = await db.collection(COL.users).where('teamId', '==', teamId).get();
  return snap.docs.map((d) => d.id).slice(0, 30);
}

// Shape a call doc into the API response (denormalized client/user names).
function shape(call) {
  return {
    ...call,
    durationFormatted: formatDuration(call.durationSeconds),
    user: call.userId ? { id: call.userId, name: call.userName || '' } : null,
    client: call.clientId ? { id: call.clientId, name: call.clientName || '', leadStatus: call.clientLeadStatus || null } : null,
  };
}

async function resolveClient(phoneNumber, providedId) {
  if (providedId) return getById(COL.clients, providedId);
  return findOne(COL.clients, (c) => c.where('mobile', '==', phoneNumber));
}

// ── Initiate (spec §8) ──
router.post('/', validate(z.object({
  phoneNumber: z.string().min(3),
  clientId: z.string().nullable().optional(),
  callStartTime: z.coerce.date().optional(),
})), asyncHandler(async (req, res) => {
  const client = await resolveClient(req.body.phoneNumber, req.body.clientId);
  const call = await create(COL.calls, {
    callId: await generateCallId(),
    userId: req.user.id, userName: req.user.name,
    clientId: client?.id || null, clientName: client?.name || null, clientLeadStatus: client?.leadStatus || null,
    phoneNumber: req.body.phoneNumber,
    callStartTime: ts(req.body.callStartTime || new Date()),
    callAnswerTime: null, callEndTime: null, durationSeconds: 0,
    callStatus: null, disposition: null, remark: null, recordingUrl: null,
  });
  await update(COL.users, req.user.id, { agentStatus: 'ON_CALL' });
  res.status(201).json({ call: shape(call) });
}));

// ── Complete with real outcome (spec §10/§11) ──
router.patch('/:id/complete', validate(z.object({
  callStatus: z.enum(CALL_STATUSES),
  callAnswerTime: z.coerce.date().nullable().optional(),
  callEndTime: z.coerce.date().nullable().optional(),
  durationSeconds: z.number().int().min(0).optional(),
})), asyncHandler(async (req, res) => {
  const call = await getById(COL.calls, req.params.id);
  if (!call) throw ApiError.notFound('Call not found');
  if (req.user.role === 'AGENT' && call.userId !== req.user.id) throw ApiError.notFound('Call not found');

  const answered = req.body.callStatus === 'ANSWERED';
  const updated = await update(COL.calls, call.id, {
    callStatus: req.body.callStatus,
    callAnswerTime: answered ? ts(req.body.callAnswerTime) : null,
    callEndTime: ts(req.body.callEndTime || new Date()),
    durationSeconds: answered ? (req.body.durationSeconds ?? 0) : 0,
  });
  await update(COL.users, call.userId, { agentStatus: 'AVAILABLE' });
  res.json({ call: shape(updated) });
}));

// ── One-shot SIM log ──
router.post('/log', validate(z.object({
  phoneNumber: z.string().min(3),
  clientId: z.string().nullable().optional(),
  callStatus: z.enum(CALL_STATUSES),
  callStartTime: z.coerce.date().optional(),
  callAnswerTime: z.coerce.date().nullable().optional(),
  callEndTime: z.coerce.date().nullable().optional(),
  durationSeconds: z.number().int().min(0).optional(),
})), asyncHandler(async (req, res) => {
  const b = req.body;
  const client = await resolveClient(b.phoneNumber, b.clientId);
  const answered = b.callStatus === 'ANSWERED';
  const call = await create(COL.calls, {
    callId: await generateCallId(),
    userId: req.user.id, userName: req.user.name,
    clientId: client?.id || null, clientName: client?.name || null, clientLeadStatus: client?.leadStatus || null,
    phoneNumber: b.phoneNumber, callStatus: b.callStatus,
    callStartTime: ts(b.callStartTime || new Date()),
    callAnswerTime: answered ? ts(b.callAnswerTime) : null,
    callEndTime: ts(b.callEndTime || new Date()),
    durationSeconds: answered ? (b.durationSeconds ?? 0) : 0,
    disposition: null, remark: null, recordingUrl: null,
  });
  res.status(201).json({ call: shape(call) });
}));

// ── Disposition + mandatory remark (spec §14/§15) ──
router.patch('/:id/disposition', validate(z.object({
  disposition: z.enum(DISPOSITIONS),
  remark: z.string().min(1, 'Remark is required'),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
})), asyncHandler(async (req, res) => {
  const call = await getById(COL.calls, req.params.id);
  if (!call) throw ApiError.notFound('Call not found');
  if (req.user.role === 'AGENT' && call.userId !== req.user.id) throw ApiError.notFound('Call not found');

  const updated = await update(COL.calls, call.id, { disposition: req.body.disposition, remark: req.body.remark });
  if (req.body.leadStatus && call.clientId) {
    await update(COL.clients, call.clientId, { leadStatus: req.body.leadStatus });
  }
  res.json({ call: shape(updated) });
}));

// ── History with filters (spec §12/§30/§31) ──
const listQuery = z.object({
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

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, offset } = parsePagination(q);
  let memberIds = null;
  if (req.user.role === 'MANAGER') memberIds = await teamMemberIds(req.user.teamId ?? '__none__');

  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  const result = await listDocs({
    collectionRef: db.collection(COL.calls),
    baseQuery: (c) => {
      let query = c;
      if (req.user.role === 'AGENT') query = query.where('userId', '==', req.user.id);
      else if (memberIds) query = query.where('userId', 'in', memberIds.length ? memberIds : ['__none__']);
      if (q.userId) query = query.where('userId', '==', q.userId);
      if (q.clientId) query = query.where('clientId', '==', q.clientId);
      if (q.callStatus) query = query.where('callStatus', '==', q.callStatus);
      if (q.disposition) query = query.where('disposition', '==', q.disposition);
      if (range?.gte) query = query.where('createdAt', '>=', ts(range.gte));
      if (range?.lte) query = query.where('createdAt', '<=', ts(range.lte));
      return query;
    },
    page, pageSize, offset, search: q.search, searchFields: ['phoneNumber', 'callId', 'clientName'],
  });
  result.data = result.data.map(shape);
  res.json(result);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const call = await getById(COL.calls, req.params.id);
  if (!call) throw ApiError.notFound('Call not found');
  if (req.user.role === 'AGENT' && call.userId !== req.user.id) throw ApiError.notFound('Call not found');
  res.json({ call: shape(call) });
}));

export default router;
