import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { db, COL } from '../admin.js';
import { getById, findOne, findMany, create, update, serialize } from '../lib/repo.js';
import { listDocs } from '../lib/list.js';
import { ApiError, asyncHandler, validate, parsePagination } from '../lib/framework.js';
import { authenticate, requireRole } from '../auth.js';
import { generateLeadId } from '../lib/ids.js';
import { statsFromCalls } from '../lib/stats.js';
import { notify } from '../notifier.js';
import { LEAD_STATUSES } from '../lib/enums.js';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Restrict a query to what the caller may see (spec §47).
function scope(req, c) {
  if (req.user.role === 'AGENT') return c.where('assignedUserId', '==', req.user.id);
  if (req.user.role === 'MANAGER') return c.where('teamId', '==', req.user.teamId ?? '__none__');
  return c;
}

async function clientCalls(clientId) {
  return findMany(COL.calls, (c) => c.where('clientId', '==', clientId));
}

// ── Contact lookup by phone (spec §7) ──
router.get('/lookup', asyncHandler(async (req, res) => {
  const number = String(req.query.number || '').trim();
  if (!number) throw ApiError.badRequest('number query param is required');
  const client = await findOne(COL.clients, (c) => scope(req, c).where('mobile', '==', number));
  if (!client) return res.json({ found: false });

  const calls = await clientCalls(client.id);
  calls.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const pendingFollow = await findOne(COL.followUps, (c) =>
    c.where('clientId', '==', client.id).where('status', '==', 'PENDING').orderBy('followupAt', 'asc'));

  res.json({
    found: true,
    client: {
      ...client,
      stats: statsFromCalls(calls),
      lastCall: calls[0] ? { callStatus: calls[0].callStatus, remark: calls[0].remark, disposition: calls[0].disposition, createdAt: calls[0].createdAt } : null,
      nextFollowUp: pendingFollow ? { followupAt: pendingFollow.followupAt, followupType: pendingFollow.followupType, note: pendingFollow.note } : null,
    },
  });
}));

// ── Call queue / "Call Next" (spec §38) ──
router.get('/queue', asyncHandler(async (req, res) => {
  let rows = await findMany(COL.clients, (c) => c.where('assignedUserId', '==', req.user.id));
  rows = rows.filter((r) => !['CONVERTED', 'NOT_INTERESTED', 'LOST'].includes(r.leadStatus)).slice(0, 100);
  res.json({ data: rows, count: rows.length });
}));

// ── List + search (spec §24) ──
const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  assignedUserId: z.string().optional(),
  search: z.string().optional(),
});

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, offset } = parsePagination(q);
  const result = await listDocs({
    collectionRef: db.collection(COL.clients),
    baseQuery: (c) => {
      let query = scope(req, c);
      if (q.leadStatus) query = query.where('leadStatus', '==', q.leadStatus);
      if (q.assignedUserId) query = query.where('assignedUserId', '==', q.assignedUserId);
      return query;
    },
    page, pageSize, offset, search: q.search,
    searchFields: ['name', 'mobile', 'email', 'leadId', 'company'],
  });
  // Attach assigned user name.
  const userCache = {};
  for (const lead of result.data) {
    if (lead.assignedUserId) {
      userCache[lead.assignedUserId] ||= await getById(COL.users, lead.assignedUserId);
      lead.assignedUser = userCache[lead.assignedUserId] ? { id: lead.assignedUserId, name: userCache[lead.assignedUserId].name } : null;
    } else lead.assignedUser = null;
  }
  res.json(result);
}));

// ── Full profile + timeline (spec §19/§20) ──
router.get('/:id', asyncHandler(async (req, res) => {
  const client = await getById(COL.clients, req.params.id);
  if (!client) throw ApiError.notFound('Lead not found');
  if (req.user.role === 'AGENT' && client.assignedUserId !== req.user.id) throw ApiError.notFound('Lead not found');

  const calls = await clientCalls(client.id);
  calls.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const followUps = await findMany(COL.followUps, (c) => c.where('clientId', '==', client.id));
  followUps.sort((a, b) => String(b.followupAt).localeCompare(String(a.followupAt)));

  // Attach agent name to each timeline call.
  const userCache = {};
  const timeline = [];
  for (const call of calls.slice(0, 100)) {
    let user = null;
    if (call.userId) { userCache[call.userId] ||= await getById(COL.users, call.userId); user = userCache[call.userId] ? { id: call.userId, name: userCache[call.userId].name } : null; }
    timeline.push({ ...call, user });
  }
  if (client.assignedUserId) {
    const au = await getById(COL.users, client.assignedUserId);
    client.assignedUser = au ? { id: au.id, name: au.name } : null;
  }

  res.json({ client: { ...client, stats: statsFromCalls(calls) }, timeline, followUps });
}));

const createSchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(6),
  alternateMobile: z.string().nullable().optional(),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  company: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  assignedUserId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
});

router.post('/', requireRole('ADMIN', 'MANAGER'), validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  if (await findOne(COL.clients, (c) => c.where('mobile', '==', b.mobile))) throw ApiError.badRequest('A lead with this mobile already exists');
  const client = await create(COL.clients, {
    leadId: await generateLeadId(),
    name: b.name, mobile: b.mobile, alternateMobile: b.alternateMobile || null,
    email: b.email || null, company: b.company || null, source: b.source || null,
    leadStatus: b.leadStatus || (b.assignedUserId ? 'ASSIGNED' : 'NEW'),
    assignedUserId: b.assignedUserId || null, teamId: b.teamId || null,
  });
  res.status(201).json({ client });
}));

router.patch('/:id', validate(createSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await getById(COL.clients, req.params.id);
  if (!existing) throw ApiError.notFound('Lead not found');
  if (req.user.role === 'AGENT' && existing.assignedUserId !== req.user.id) throw ApiError.notFound('Lead not found');
  const client = await update(COL.clients, req.params.id, req.body);
  res.json({ client });
}));

// ── Assign (spec §22) ──
router.patch('/:id/assign', requireRole('ADMIN', 'MANAGER'), validate(z.object({
  assignedUserId: z.string().min(1),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
})), asyncHandler(async (req, res) => {
  const agent = await getById(COL.users, req.body.assignedUserId);
  if (!agent) throw ApiError.badRequest('Assigned user does not exist');
  const client = await update(COL.clients, req.params.id, {
    assignedUserId: agent.id, teamId: agent.teamId ?? null, leadStatus: req.body.leadStatus || 'ASSIGNED',
  });
  await notify({ userId: agent.id, type: 'LEAD_ASSIGNED', title: `New lead assigned: ${client.name}`, body: client.company || client.mobile, entityType: 'Client', entityId: client.id });
  res.json({ client });
}));

// ── Bulk import (spec §23) ──
router.post('/import', requireRole('ADMIN', 'MANAGER'), upload.single('file'), asyncHandler(async (req, res) => {
  let rawRows = [];
  if (req.file) rawRows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
  else if (Array.isArray(req.body?.rows)) rawRows = req.body.rows;
  else throw ApiError.badRequest('Provide a CSV file ("file") or JSON { rows: [...] }');
  if (rawRows.length === 0) throw ApiError.badRequest('No rows found');
  if (rawRows.length > 5000) throw ApiError.badRequest('Import limited to 5000 rows');

  const pick = (raw, ...keys) => {
    for (const k of keys) {
      const found = Object.keys(raw).find((rk) => rk.trim().toLowerCase() === k);
      if (found && String(raw[found]).trim() !== '') return String(raw[found]).trim();
    }
    return undefined;
  };

  const results = { total: rawRows.length, imported: 0, skipped: 0, errors: [] };
  const seen = new Set();
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const name = pick(raw, 'name', 'client name', 'full name');
    const mobile = pick(raw, 'mobile', 'phone', 'phone number', 'mobile number');
    if (!name || !mobile) { results.skipped++; results.errors.push({ row: i + 1, reason: 'name & mobile required' }); continue; }
    if (seen.has(mobile) || await findOne(COL.clients, (c) => c.where('mobile', '==', mobile))) {
      results.skipped++; results.errors.push({ row: i + 1, reason: `Duplicate mobile ${mobile}` }); continue;
    }
    seen.add(mobile);
    await create(COL.clients, {
      leadId: await generateLeadId(), name, mobile,
      email: pick(raw, 'email') || null, company: pick(raw, 'company') || null,
      source: pick(raw, 'source', 'lead source') || 'Import',
      leadStatus: 'NEW', assignedUserId: null, teamId: null, alternateMobile: null,
    });
    results.imported++;
  }
  res.json(results);
}));

export default router;
