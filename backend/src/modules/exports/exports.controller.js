import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendExport } from '../../utils/exporter.js';
import { buildCallStats, formatDuration, dateRangeFromPreset } from '../../utils/stats.js';
import { titleCaseEnum } from '../../utils/text.js';

// Managers are scoped to their team; admins see everything.
function callScope(user) {
  if (user.role === 'MANAGER') return { user: { teamId: user.teamId ?? '__none__' } };
  return {};
}
function leadScope(user) {
  if (user.role === 'MANAGER') return { teamId: user.teamId ?? '__none__' };
  return {};
}

// GET /exports/calls?format=csv|xlsx|pdf&datePreset=&callStatus=&disposition=
export const exportCalls = asyncHandler(async (req, res) => {
  const q = req.query;
  const where = { ...callScope(req.user) };
  if (q.callStatus) where.callStatus = q.callStatus;
  if (q.disposition) where.disposition = q.disposition;
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  if (range) where.createdAt = range;

  const calls = await prisma.call.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50000,
    select: {
      callId: true, phoneNumber: true, callStatus: true, disposition: true, remark: true,
      durationSeconds: true, createdAt: true,
      user: { select: { name: true } },
      client: { select: { name: true, leadStatus: true } },
    },
  });

  const rows = calls.map((c) => ({
    callId: c.callId,
    date: c.createdAt.toISOString().slice(0, 10),
    time: c.createdAt.toISOString().slice(11, 19),
    agent: c.user?.name || '',
    client: c.client?.name || '',
    phone: c.phoneNumber,
    status: titleCaseEnum(c.callStatus),
    disposition: titleCaseEnum(c.disposition),
    duration: formatDuration(c.durationSeconds),
    remark: c.remark || '',
    leadStatus: titleCaseEnum(c.client?.leadStatus),
  }));

  await sendExport(res, q.format, {
    filename: `call-report-${Date.now()}`,
    title: 'Call Report',
    columns: [
      { header: 'Call ID', key: 'callId', width: 22 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Time', key: 'time', width: 10 },
      { header: 'Agent', key: 'agent', width: 18 },
      { header: 'Client', key: 'client', width: 18 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Disposition', key: 'disposition', width: 16 },
      { header: 'Duration', key: 'duration', width: 10 },
      { header: 'Remark', key: 'remark', width: 30 },
      { header: 'Lead Status', key: 'leadStatus', width: 14 },
    ],
    rows,
  });
});

// GET /exports/leads?format=&leadStatus=
export const exportLeads = asyncHandler(async (req, res) => {
  const q = req.query;
  const where = { ...leadScope(req.user) };
  if (q.leadStatus) where.leadStatus = q.leadStatus;

  const leads = await prisma.client.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50000,
    select: {
      leadId: true, name: true, mobile: true, email: true, company: true, source: true,
      leadStatus: true, createdAt: true, assignedUser: { select: { name: true } },
    },
  });

  const rows = leads.map((l) => ({
    leadId: l.leadId,
    name: l.name,
    mobile: l.mobile,
    email: l.email || '',
    company: l.company || '',
    source: l.source || '',
    leadStatus: titleCaseEnum(l.leadStatus),
    assigned: l.assignedUser?.name || 'Unassigned',
    created: l.createdAt.toISOString().slice(0, 10),
  }));

  await sendExport(res, q.format, {
    filename: `leads-${Date.now()}`,
    title: 'Leads Report',
    columns: [
      { header: 'Lead ID', key: 'leadId', width: 14 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Company', key: 'company', width: 20 },
      { header: 'Source', key: 'source', width: 14 },
      { header: 'Lead Status', key: 'leadStatus', width: 14 },
      { header: 'Assigned', key: 'assigned', width: 18 },
      { header: 'Created', key: 'created', width: 12 },
    ],
    rows,
  });
});

// GET /exports/user-performance?format=&datePreset=
export const exportUserPerformance = asyncHandler(async (req, res) => {
  const q = req.query;
  const where = {};
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  if (range) where.createdAt = range;
  if (req.user.role === 'MANAGER') where.user = { teamId: req.user.teamId ?? '__none__' };

  const [totals, answered, users] = await Promise.all([
    prisma.call.groupBy({ by: ['userId'], where, _count: { _all: true } }),
    prisma.call.groupBy({ by: ['userId'], where: { ...where, callStatus: 'ANSWERED' }, _count: { _all: true }, _sum: { durationSeconds: true } }),
    prisma.user.findMany({ where: { role: 'AGENT' }, select: { id: true, name: true, team: { select: { name: true } } } }),
  ]);
  const tMap = new Map(totals.map((t) => [t.userId, t._count._all]));
  const aMap = new Map(answered.map((a) => [a.userId, a]));

  const rows = users.map((u) => {
    const total = tMap.get(u.id) || 0;
    const a = aMap.get(u.id);
    const stats = buildCallStats({ totalCalls: total, answeredCalls: a?._count._all || 0, talkTimeSeconds: a?._sum.durationSeconds || 0 });
    return {
      agent: u.name,
      team: u.team?.name || '',
      calls: stats.totalCalls,
      answered: stats.answeredCalls,
      unanswered: stats.unansweredCalls,
      answerRate: `${stats.answerRate}%`,
      talkTime: stats.totalTalkTime,
      avgTalk: stats.avgTalkTime,
    };
  }).sort((x, y) => y.calls - x.calls);

  await sendExport(res, q.format, {
    filename: `user-performance-${Date.now()}`,
    title: 'Agent Performance',
    columns: [
      { header: 'Agent', key: 'agent', width: 20 },
      { header: 'Team', key: 'team', width: 16 },
      { header: 'Calls', key: 'calls', width: 10 },
      { header: 'Answered', key: 'answered', width: 10 },
      { header: 'Unanswered', key: 'unanswered', width: 12 },
      { header: 'Answer Rate', key: 'answerRate', width: 12 },
      { header: 'Talk Time', key: 'talkTime', width: 12 },
      { header: 'Avg Talk', key: 'avgTalk', width: 12 },
    ],
    rows,
  });
});
