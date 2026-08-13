import { Router } from 'express';
import { z } from 'zod';
import { db, COL } from '../admin.js';
import { getById, create, update, ts } from '../lib/repo.js';
import { listDocs } from '../lib/list.js';
import { ApiError, asyncHandler, validate, parsePagination } from '../lib/framework.js';
import { authenticate } from '../auth.js';
import { FOLLOWUP_TYPES, FOLLOWUP_STATUSES } from '../lib/enums.js';

const router = Router();
router.use(authenticate);

async function teamMemberIds(teamId) {
  const snap = await db.collection(COL.users).where('teamId', '==', teamId).get();
  return snap.docs.map((d) => d.id).slice(0, 30);
}

function resolveQuick(quick) {
  const d = new Date();
  switch (quick) {
    case '1hour': d.setHours(d.getHours() + 1); return d;
    case 'today': d.setHours(18, 0, 0, 0); return d;
    case 'tomorrow': d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d;
    case '2days': d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0); return d;
    case 'nextweek': d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d;
    default: return null;
  }
}

async function shape(f) {
  const client = f.clientId ? await getById(COL.clients, f.clientId) : null;
  const user = f.userId ? await getById(COL.users, f.userId) : null;
  return {
    ...f,
    client: client ? { id: client.id, leadId: client.leadId, name: client.name, mobile: client.mobile, company: client.company } : null,
    user: user ? { id: user.id, name: user.name } : null,
  };
}

const createSchema = z.object({
  clientId: z.string().min(1),
  callId: z.string().nullable().optional(),
  followupAt: z.coerce.date().optional(),
  quick: z.enum(['1hour', 'today', 'tomorrow', '2days', 'nextweek']).optional(),
  followupType: z.enum(FOLLOWUP_TYPES).default('CALL'),
  note: z.string().nullable().optional(),
}).refine((d) => d.followupAt || d.quick, { message: 'Provide followupAt or a quick option' });

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const when = b.followupAt || resolveQuick(b.quick);
  if (!when) throw ApiError.badRequest('Invalid follow-up time');
  const client = await getById(COL.clients, b.clientId);
  if (!client) throw ApiError.notFound('Lead not found');
  if (req.user.role === 'AGENT' && client.assignedUserId !== req.user.id) throw ApiError.notFound('Lead not found');

  const followUp = await create(COL.followUps, {
    clientId: b.clientId, callId: b.callId || null, userId: req.user.id,
    followupAt: ts(when), followupType: b.followupType, note: b.note || null,
    status: 'PENDING', reminderSent: false, overdueNotified: false,
  });
  res.status(201).json({ followUp: await shape(followUp) });
}));

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  scope: z.enum(['today', 'upcoming', 'overdue', 'completed', 'missed', 'all']).default('all'),
  clientId: z.string().optional(),
});

router.get('/', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, offset } = parsePagination(q);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let memberIds = null;
  if (req.user.role === 'MANAGER') memberIds = await teamMemberIds(req.user.teamId ?? '__none__');

  const result = await listDocs({
    collectionRef: db.collection(COL.followUps),
    orderByField: 'followupAt',
    orderDir: q.scope === 'completed' || q.scope === 'missed' ? 'desc' : 'asc',
    baseQuery: (c) => {
      let query = c;
      if (req.user.role === 'AGENT') query = query.where('userId', '==', req.user.id);
      else if (memberIds) query = query.where('userId', 'in', memberIds.length ? memberIds : ['__none__']);
      if (q.clientId) query = query.where('clientId', '==', q.clientId);
      switch (q.scope) {
        case 'today': query = query.where('status', '==', 'PENDING').where('followupAt', '>=', ts(startToday)).where('followupAt', '<=', ts(endToday)); break;
        case 'upcoming': query = query.where('status', '==', 'PENDING').where('followupAt', '>', ts(endToday)); break;
        case 'overdue': query = query.where('status', '==', 'PENDING').where('followupAt', '<', ts(now)); break;
        case 'completed': query = query.where('status', '==', 'COMPLETED'); break;
        case 'missed': query = query.where('status', '==', 'MISSED'); break;
        default: break;
      }
      return query;
    },
    page, pageSize, offset,
  });
  result.data = await Promise.all(result.data.map(shape));
  res.json(result);
}));

router.patch('/:id', validate(z.object({
  status: z.enum(FOLLOWUP_STATUSES).optional(),
  followupAt: z.coerce.date().optional(),
  followupType: z.enum(FOLLOWUP_TYPES).optional(),
  note: z.string().nullable().optional(),
})), asyncHandler(async (req, res) => {
  const existing = await getById(COL.followUps, req.params.id);
  if (!existing) throw ApiError.notFound('Follow-up not found');
  if (req.user.role === 'AGENT' && existing.userId !== req.user.id) throw ApiError.notFound('Follow-up not found');
  const data = { ...req.body };
  if (data.followupAt) data.followupAt = ts(data.followupAt);
  const followUp = await update(COL.followUps, req.params.id, data);
  res.json({ followUp: await shape(followUp) });
}));

export default router;
