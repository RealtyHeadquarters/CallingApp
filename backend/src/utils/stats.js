// Reporting formulas (spec §42). All values are computed from real Call rows.
// A call is "answered" iff callStatus === 'ANSWERED'. Only answered calls
// contribute to talk time (spec §11).

// Given aggregate counts, produce the standard KPI object.
export function buildCallStats({ totalCalls, answeredCalls, talkTimeSeconds }) {
  const answered = answeredCalls || 0;
  const total = totalCalls || 0;
  const unanswered = total - answered;
  const talkTime = talkTimeSeconds || 0;
  return {
    totalCalls: total,
    answeredCalls: answered,
    unansweredCalls: unanswered,
    answerRate: total > 0 ? Math.round((answered / total) * 1000) / 10 : 0, // one decimal, %
    totalTalkTimeSeconds: talkTime,
    totalTalkTime: formatDuration(talkTime),
    avgTalkTimeSeconds: answered > 0 ? Math.round(talkTime / answered) : 0,
    avgTalkTime: formatDuration(answered > 0 ? Math.round(talkTime / answered) : 0),
  };
}

// Compute KPIs for a set of calls using Prisma aggregates against a where clause.
export async function computeCallStats(prisma, where) {
  const [total, answeredAgg] = await Promise.all([
    prisma.call.count({ where }),
    prisma.call.aggregate({
      where: { ...where, callStatus: 'ANSWERED' },
      _count: { _all: true },
      _sum: { durationSeconds: true },
    }),
  ]);
  return buildCallStats({
    totalCalls: total,
    answeredCalls: answeredAgg._count._all,
    talkTimeSeconds: answeredAgg._sum.durationSeconds || 0,
  });
}

// Seconds -> HH:MM:SS
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

// Boundaries for common report date filters (spec §31), in the server's timezone.
export function dateRangeFromPreset(preset, customStart, customEnd) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { gte: startOfDay(y), lte: endOfDay(y) };
    }
    case 'last7': {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { gte: startOfDay(s), lte: endOfDay(now) };
    }
    case 'last30': {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { gte: startOfDay(s), lte: endOfDay(now) };
    }
    case 'thisMonth':
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: endOfDay(now) };
    case 'custom': {
      const range = {};
      if (customStart) range.gte = new Date(customStart);
      if (customEnd) range.lte = new Date(customEnd);
      return Object.keys(range).length ? range : undefined;
    }
    default:
      return undefined;
  }
}
