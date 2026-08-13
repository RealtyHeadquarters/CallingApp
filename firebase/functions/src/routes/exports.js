import { Router } from 'express';
import { COL } from '../admin.js';
import { findMany, ts } from '../lib/repo.js';
import { asyncHandler } from '../lib/framework.js';
import { authenticate, requireRole } from '../auth.js';
import { sendExport } from '../lib/exporter.js';
import { buildCallStats, formatDuration, dateRangeFromPreset } from '../lib/stats.js';
import { titleCaseEnum } from '../lib/enums.js';

const router = Router();
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

// Call report export (spec §46)
router.get('/calls', asyncHandler(async (req, res) => {
  const q = req.query;
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  const calls = await findMany(COL.calls, (c) => {
    let query = c;
    if (q.callStatus) query = query.where('callStatus', '==', q.callStatus);
    if (q.disposition) query = query.where('disposition', '==', q.disposition);
    if (range?.gte) query = query.where('createdAt', '>=', ts(range.gte));
    if (range?.lte) query = query.where('createdAt', '<=', ts(range.lte));
    return query;
  });
  calls.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const rows = calls.map((c) => ({
    callId: c.callId,
    date: String(c.createdAt).slice(0, 10),
    time: String(c.createdAt).slice(11, 19),
    agent: c.userName || '',
    client: c.clientName || '',
    phone: c.phoneNumber,
    status: titleCaseEnum(c.callStatus),
    disposition: titleCaseEnum(c.disposition),
    duration: formatDuration(c.durationSeconds),
    remark: c.remark || '',
  }));

  await sendExport(res, q.format, {
    filename: `call-report-${Date.now()}`,
    title: 'Call Report',
    columns: [
      { header: 'Call ID', key: 'callId', width: 22 }, { header: 'Date', key: 'date', width: 12 },
      { header: 'Time', key: 'time', width: 10 }, { header: 'Agent', key: 'agent', width: 18 },
      { header: 'Client', key: 'client', width: 18 }, { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Status', key: 'status', width: 12 }, { header: 'Disposition', key: 'disposition', width: 16 },
      { header: 'Duration', key: 'duration', width: 10 }, { header: 'Remark', key: 'remark', width: 30 },
    ],
    rows,
  });
}));

// Leads export
router.get('/leads', asyncHandler(async (req, res) => {
  const q = req.query;
  const leads = await findMany(COL.clients, (c) => (q.leadStatus ? c.where('leadStatus', '==', q.leadStatus) : c));
  leads.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const rows = leads.map((l) => ({
    leadId: l.leadId, name: l.name, mobile: l.mobile, email: l.email || '',
    company: l.company || '', source: l.source || '', leadStatus: titleCaseEnum(l.leadStatus),
    created: String(l.createdAt).slice(0, 10),
  }));
  await sendExport(res, q.format, {
    filename: `leads-${Date.now()}`, title: 'Leads Report',
    columns: [
      { header: 'Lead ID', key: 'leadId', width: 14 }, { header: 'Name', key: 'name', width: 20 },
      { header: 'Mobile', key: 'mobile', width: 15 }, { header: 'Email', key: 'email', width: 24 },
      { header: 'Company', key: 'company', width: 20 }, { header: 'Source', key: 'source', width: 14 },
      { header: 'Lead Status', key: 'leadStatus', width: 14 }, { header: 'Created', key: 'created', width: 12 },
    ],
    rows,
  });
}));

// Agent performance export (spec §27/§46)
router.get('/user-performance', asyncHandler(async (req, res) => {
  const q = req.query;
  const range = dateRangeFromPreset(q.datePreset, q.startDate, q.endDate);
  const [calls, agents] = await Promise.all([
    findMany(COL.calls, (c) => {
      let query = c;
      if (range?.gte) query = query.where('createdAt', '>=', ts(range.gte));
      if (range?.lte) query = query.where('createdAt', '<=', ts(range.lte));
      return query;
    }),
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
    const s = buildCallStats({ totalCalls: g.total, answeredCalls: g.answered, talkTimeSeconds: g.talk });
    return { agent: u.name, calls: s.totalCalls, answered: s.answeredCalls, unanswered: s.unansweredCalls, answerRate: `${s.answerRate}%`, talkTime: s.totalTalkTime, avgTalk: s.avgTalkTime };
  }).sort((a, b) => b.calls - a.calls);

  await sendExport(res, q.format, {
    filename: `agent-performance-${Date.now()}`, title: 'Agent Performance',
    columns: [
      { header: 'Agent', key: 'agent', width: 20 }, { header: 'Calls', key: 'calls', width: 10 },
      { header: 'Answered', key: 'answered', width: 10 }, { header: 'Unanswered', key: 'unanswered', width: 12 },
      { header: 'Answer Rate', key: 'answerRate', width: 12 }, { header: 'Talk Time', key: 'talkTime', width: 12 },
      { header: 'Avg Talk', key: 'avgTalk', width: 12 },
    ],
    rows,
  });
}));

export default router;
