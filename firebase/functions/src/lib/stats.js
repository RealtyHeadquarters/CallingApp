// Reporting formulas (spec §42). Firestore has no GROUP BY, so we read the
// relevant call docs and aggregate in JS. Fine at demo/SMB scale; for very large
// data you'd maintain rollup docs via triggers.

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export function buildCallStats({ totalCalls, answeredCalls, talkTimeSeconds }) {
  const answered = answeredCalls || 0;
  const total = totalCalls || 0;
  const talk = talkTimeSeconds || 0;
  return {
    totalCalls: total,
    answeredCalls: answered,
    unansweredCalls: total - answered,
    answerRate: total > 0 ? Math.round((answered / total) * 1000) / 10 : 0,
    totalTalkTimeSeconds: talk,
    totalTalkTime: formatDuration(talk),
    avgTalkTimeSeconds: answered > 0 ? Math.round(talk / answered) : 0,
    avgTalkTime: formatDuration(answered > 0 ? Math.round(talk / answered) : 0),
  };
}

// Aggregate a list of call docs (already filtered) into the KPI object.
export function statsFromCalls(calls) {
  let answered = 0;
  let talk = 0;
  for (const c of calls) {
    if (c.callStatus === 'ANSWERED') {
      answered += 1;
      talk += c.durationSeconds || 0;
    }
  }
  return buildCallStats({ totalCalls: calls.length, answeredCalls: answered, talkTimeSeconds: talk });
}

// Date range for report presets (spec §31).
export function dateRangeFromPreset(preset, customStart, customEnd) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (preset) {
    case 'today': return { gte: startOfDay(now), lte: endOfDay(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { gte: startOfDay(y), lte: endOfDay(y) }; }
    case 'last7': { const s = new Date(now); s.setDate(s.getDate() - 6); return { gte: startOfDay(s), lte: endOfDay(now) }; }
    case 'last30': { const s = new Date(now); s.setDate(s.getDate() - 29); return { gte: startOfDay(s), lte: endOfDay(now) }; }
    case 'thisMonth': return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: endOfDay(now) };
    case 'custom': {
      const r = {};
      if (customStart) r.gte = new Date(customStart);
      if (customEnd) r.lte = new Date(customEnd);
      return Object.keys(r).length ? r : undefined;
    }
    default: return undefined;
  }
}
