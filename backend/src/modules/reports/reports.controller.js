import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { buildCallStats, formatDuration, dateRangeFromPreset } from '../../utils/stats.js';
import { DISPOSITIONS } from '../../utils/enums.js';

const rangeQuery = z.object({
  datePreset: z.enum(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function whereFromQuery(q, extra = {}) {
  const where = { ...extra };
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  if (range) where.createdAt = range;
  return where;
}

// Merge total & answered groupBy results keyed by a field into a stats map.
function mergeGroups(totals, answered, key) {
  const map = new Map();
  for (const t of totals) {
    map.set(t[key], { total: t._count._all, answered: 0, talk: 0 });
  }
  for (const a of answered) {
    const entry = map.get(a[key]) || { total: 0, answered: 0, talk: 0 };
    entry.answered = a._count._all;
    entry.talk = a._sum.durationSeconds || 0;
    map.set(a[key], entry);
  }
  return map;
}

// Per-agent performance (spec §27).
export const userPerformance = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const where = whereFromQuery(q);

  const [totals, answered, users] = await Promise.all([
    prisma.call.groupBy({ by: ['userId'], where, _count: { _all: true } }),
    prisma.call.groupBy({ by: ['userId'], where: { ...where, callStatus: 'ANSWERED' }, _count: { _all: true }, _sum: { durationSeconds: true } }),
    prisma.user.findMany({ where: { role: 'AGENT' }, select: { id: true, name: true, teamId: true, team: { select: { name: true } } } }),
  ]);

  const map = mergeGroups(totals, answered, 'userId');
  const rows = users.map((u) => {
    const g = map.get(u.id) || { total: 0, answered: 0, talk: 0 };
    const stats = buildCallStats({ totalCalls: g.total, answeredCalls: g.answered, talkTimeSeconds: g.talk });
    return { userId: u.id, name: u.name, team: u.team?.name || null, ...stats };
  });
  rows.sort((a, b) => b.totalCalls - a.totalCalls);
  res.json({ data: rows });
});

// Per-team performance (spec §28).
export const teamPerformance = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const where = whereFromQuery(q);

  const [teams, users] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: 'AGENT' }, select: { id: true, teamId: true } }),
  ]);
  const userTeam = new Map(users.map((u) => [u.id, u.teamId]));
  const agentCount = new Map();
  for (const u of users) if (u.teamId) agentCount.set(u.teamId, (agentCount.get(u.teamId) || 0) + 1);

  const [totals, answered] = await Promise.all([
    prisma.call.groupBy({ by: ['userId'], where, _count: { _all: true } }),
    prisma.call.groupBy({ by: ['userId'], where: { ...where, callStatus: 'ANSWERED' }, _count: { _all: true }, _sum: { durationSeconds: true } }),
  ]);

  const teamAgg = new Map(); // teamId -> {total, answered, talk}
  const add = (teamId, field, val) => {
    if (!teamId) return;
    const e = teamAgg.get(teamId) || { total: 0, answered: 0, talk: 0 };
    e[field] += val;
    teamAgg.set(teamId, e);
  };
  for (const t of totals) add(userTeam.get(t.userId), 'total', t._count._all);
  for (const a of answered) {
    add(userTeam.get(a.userId), 'answered', a._count._all);
    add(userTeam.get(a.userId), 'talk', a._sum.durationSeconds || 0);
  }

  const rows = teams.map((t) => {
    const g = teamAgg.get(t.id) || { total: 0, answered: 0, talk: 0 };
    const stats = buildCallStats({ totalCalls: g.total, answeredCalls: g.answered, talkTimeSeconds: g.talk });
    return { teamId: t.id, name: t.name, agents: agentCount.get(t.id) || 0, ...stats };
  });
  res.json({ data: rows });
});

// Visual analytics (spec §34): call volume series, disposition breakdown, lead conversion.
export const analytics = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const where = whereFromQuery(q);

  const [byDisposition, leadTotals, dispositionRaw] = await Promise.all([
    prisma.call.groupBy({ by: ['disposition'], where: { ...where, disposition: { not: null } }, _count: { _all: true } }),
    prisma.client.groupBy({ by: ['leadStatus'], _count: { _all: true } }),
    prisma.call.findMany({ where, select: { createdAt: true, callStatus: true, durationSeconds: true } }),
  ]);

  // Daily call volume + answer rate + talk time series (grouped in JS by day).
  const days = new Map();
  for (const c of dispositionRaw) {
    const day = c.createdAt.toISOString().slice(0, 10);
    const e = days.get(day) || { date: day, total: 0, answered: 0, talk: 0 };
    e.total++;
    if (c.callStatus === 'ANSWERED') {
      e.answered++;
      e.talk += c.durationSeconds || 0;
    }
    days.set(day, e);
  }
  const volumeSeries = [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      totalCalls: d.total,
      answeredCalls: d.answered,
      answerRate: d.total ? Math.round((d.answered / d.total) * 1000) / 10 : 0,
      talkTimeSeconds: d.talk,
      talkTime: formatDuration(d.talk),
    }));

  const disposition = DISPOSITIONS.map((key) => ({
    disposition: key,
    count: byDisposition.find((d) => d.disposition === key)?._count._all || 0,
  }));

  const leadConversion = {
    totalLeads: leadTotals.reduce((s, l) => s + l._count._all, 0),
    converted: leadTotals.find((l) => l.leadStatus === 'CONVERTED')?._count._all || 0,
    byStatus: leadTotals.map((l) => ({ leadStatus: l.leadStatus, count: l._count._all })),
  };

  res.json({ volumeSeries, disposition, leadConversion });
});

export { rangeQuery };
