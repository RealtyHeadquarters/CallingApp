import { Router } from 'express';
import { z } from 'zod';
import { COL } from '../admin.js';
import { findMany, ts } from '../lib/repo.js';
import { asyncHandler, validate } from '../lib/framework.js';
import { authenticate, requireRole } from '../auth.js';
import { buildCallStats, formatDuration, dateRangeFromPreset } from '../lib/stats.js';
import { DISPOSITIONS } from '../lib/enums.js';

const router = Router();
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

const rangeQuery = z.object({
  datePreset: z.enum(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Fetch calls within the requested date range.
async function callsInRange(q) {
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  return findMany(COL.calls, (c) => {
    let query = c;
    if (range?.gte) query = query.where('createdAt', '>=', ts(range.gte));
    if (range?.lte) query = query.where('createdAt', '<=', ts(range.lte));
    return query;
  });
}

// Per-agent performance (spec §27)
router.get('/user-performance', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const [calls, agents] = await Promise.all([
    callsInRange(req.validatedQuery),
    findMany(COL.users, (c) => c.where('role', '==', 'AGENT')),
  ]);
  const byUser = new Map();
  for (const call of calls) {
    const e = byUser.get(call.userId) || { total: 0, answered: 0, talk: 0 };
    e.total += 1;
    if (call.callStatus === 'ANSWERED') { e.answered += 1; e.talk += call.durationSeconds || 0; }
    byUser.set(call.userId, e);
  }
  const rows = agents.map((u) => {
    const g = byUser.get(u.id) || { total: 0, answered: 0, talk: 0 };
    return { userId: u.id, name: u.name, team: null, ...buildCallStats({ totalCalls: g.total, answeredCalls: g.answered, talkTimeSeconds: g.talk }) };
  }).sort((a, b) => b.totalCalls - a.totalCalls);
  res.json({ data: rows });
}));

// Per-team performance (spec §28)
router.get('/team-performance', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const [calls, teams, users] = await Promise.all([
    callsInRange(req.validatedQuery),
    findMany(COL.teams),
    findMany(COL.users, (c) => c.where('role', '==', 'AGENT')),
  ]);
  const userTeam = new Map(users.map((u) => [u.id, u.teamId]));
  const agentCount = new Map();
  for (const u of users) if (u.teamId) agentCount.set(u.teamId, (agentCount.get(u.teamId) || 0) + 1);

  const byTeam = new Map();
  for (const call of calls) {
    const teamId = userTeam.get(call.userId);
    if (!teamId) continue;
    const e = byTeam.get(teamId) || { total: 0, answered: 0, talk: 0 };
    e.total += 1;
    if (call.callStatus === 'ANSWERED') { e.answered += 1; e.talk += call.durationSeconds || 0; }
    byTeam.set(teamId, e);
  }
  const rows = teams.map((t) => {
    const g = byTeam.get(t.id) || { total: 0, answered: 0, talk: 0 };
    return { teamId: t.id, name: t.name, agents: agentCount.get(t.id) || 0, ...buildCallStats({ totalCalls: g.total, answeredCalls: g.answered, talkTimeSeconds: g.talk }) };
  });
  res.json({ data: rows });
}));

// Visual analytics (spec §34)
router.get('/analytics', validate(rangeQuery, 'query'), asyncHandler(async (req, res) => {
  const [calls, leads] = await Promise.all([callsInRange(req.validatedQuery), findMany(COL.clients)]);

  const days = new Map();
  const dispCount = new Map();
  for (const c of calls) {
    const day = String(c.createdAt).slice(0, 10);
    const e = days.get(day) || { date: day, total: 0, answered: 0, talk: 0 };
    e.total += 1;
    if (c.callStatus === 'ANSWERED') { e.answered += 1; e.talk += c.durationSeconds || 0; }
    days.set(day, e);
    if (c.disposition) dispCount.set(c.disposition, (dispCount.get(c.disposition) || 0) + 1);
  }
  const volumeSeries = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
    date: d.date, totalCalls: d.total, answeredCalls: d.answered,
    answerRate: d.total ? Math.round((d.answered / d.total) * 1000) / 10 : 0,
    talkTimeSeconds: d.talk, talkTime: formatDuration(d.talk),
  }));
  const disposition = DISPOSITIONS.map((k) => ({ disposition: k, count: dispCount.get(k) || 0 }));

  const byStatus = new Map();
  for (const l of leads) byStatus.set(l.leadStatus, (byStatus.get(l.leadStatus) || 0) + 1);
  const leadConversion = {
    totalLeads: leads.length,
    converted: byStatus.get('CONVERTED') || 0,
    byStatus: [...byStatus.entries()].map(([leadStatus, count]) => ({ leadStatus, count })),
  };

  res.json({ volumeSeries, disposition, leadConversion });
}));

export default router;
