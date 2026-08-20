import { prisma } from '../lib/prisma.js';

// Live usage metering — counts are computed on demand (self-healing, no counter
// table to drift). Call metering is per BILLING PERIOD; users/leads are current totals.

// The window for the current billing period.
export function periodWindow(sub, now = new Date()) {
  if (!sub) return { start: new Date(0), end: null };
  if (sub.status === 'TRIAL' || !sub.currentPeriodEnd) {
    return { start: sub.startDate ? new Date(sub.startDate) : new Date(0), end: sub.trialEndsAt || null };
  }
  const end = new Date(sub.currentPeriodEnd);
  const start = new Date(end);
  if (sub.billingCycle === 'YEARLY') start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(start.getMonth() - 1);
  return { start, end };
}

const pct = (used, limit) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : null);

// Full usage snapshot for a tenant (explicit tenantId → works under super-admin
// bypass too; under a tenant request the extension re-scopes to the same tenant).
export async function getUsage(tenantId, sub, limits) {
  const { start, end } = periodWindow(sub);
  const [users, leads, calls] = await Promise.all([
    prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.client.count({ where: { tenantId } }),
    prisma.call.count({ where: { tenantId, createdAt: { gte: start } } }),
  ]);
  return {
    period: { start, end },
    users: { used: users, limit: limits?.users ?? null, percent: pct(users, limits?.users) },
    calls: { used: calls, limit: limits?.calls ?? null, percent: pct(calls, limits?.calls) },
    leads: { used: leads, limit: null, percent: null },
  };
}

// Is one more `metric` allowed? null limit = unlimited.
export async function checkLimit(metric, tenantId, limits, sub) {
  if (metric === 'USERS') {
    const limit = limits?.users ?? null;
    if (limit == null) return { allowed: true, used: 0, limit: null };
    const used = await prisma.user.count({ where: { tenantId, status: 'ACTIVE' } });
    return { allowed: used < limit, used, limit };
  }
  if (metric === 'CALLS') {
    const limit = limits?.calls ?? null;
    if (limit == null) return { allowed: true, used: 0, limit: null };
    const { start } = periodWindow(sub);
    const used = await prisma.call.count({ where: { tenantId, createdAt: { gte: start } } });
    return { allowed: used < limit, used, limit };
  }
  return { allowed: true };
}
