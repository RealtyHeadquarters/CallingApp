// Subscription lifecycle helpers. The EFFECTIVE access state is always computed
// from dates here (authoritative) — the persisted `status` reflects the last
// super-admin action but may lag the clock (e.g. period ended overnight).

const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);
const DAY_MS = 86400000;

export function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// Effective access state from a subscription row (+ now).
//   NONE     → no billing configured (grandfathered, unrestricted)
//   TRIAL    → in trial window
//   ACTIVE   → within paid period
//   GRACE    → period ended but within grace (full access + banner)
//   EXPIRED  → past grace → read-only until renewed
//   CANCELLED→ explicitly cancelled → read-only
export function resolveSubscription(sub, now = new Date()) {
  if (!sub) return { state: 'NONE', readOnly: false, inGrace: false, endsAt: null };
  if (sub.status === 'CANCELLED') return { state: 'CANCELLED', readOnly: true, inGrace: false, endsAt: sub.canceledAt || null };
  if (sub.status === 'TRIAL' && sub.trialEndsAt && new Date(sub.trialEndsAt) > now) {
    return { state: 'TRIAL', readOnly: false, inGrace: false, endsAt: sub.trialEndsAt };
  }
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now) {
    return { state: 'ACTIVE', readOnly: false, inGrace: false, endsAt: sub.currentPeriodEnd };
  }
  if (sub.graceEndsAt && new Date(sub.graceEndsAt) > now) {
    return { state: 'GRACE', readOnly: false, inGrace: true, endsAt: sub.graceEndsAt };
  }
  return { state: 'EXPIRED', readOnly: true, inGrace: false, endsAt: sub.graceEndsAt || sub.currentPeriodEnd || sub.trialEndsAt || null };
}

export function daysLeft(endsAt, now = new Date()) {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY_MS));
}

// Client/admin-facing shape.
export function serializeSubscription(sub, now = new Date()) {
  if (!sub) return null;
  const st = resolveSubscription(sub, now);
  return {
    id: sub.id,
    status: sub.status,
    state: st.state,
    readOnly: st.readOnly,
    inGrace: st.inGrace,
    endsAt: st.endsAt,
    daysLeft: daysLeft(st.endsAt, now),
    billingCycle: sub.billingCycle,
    startDate: sub.startDate,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEndsAt: sub.trialEndsAt,
    graceEndsAt: sub.graceEndsAt,
    canceledAt: sub.canceledAt,
    limits: { users: sub.userLimit ?? null, calls: sub.callLimit ?? null, storageMb: sub.storageLimitMb ?? null },
    plan: sub.plan ? { id: sub.plan.id, name: sub.plan.name, code: sub.plan.code } : null,
  };
}

// Fields to persist when assigning/renewing a PAID plan for `billingCycle`.
export function planPeriodFields(plan, billingCycle, now = new Date()) {
  const months = billingCycle === 'YEARLY' ? 12 : 1;
  const currentPeriodEnd = addMonths(now, months);
  const graceEndsAt = new Date(currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS);
  return {
    status: 'ACTIVE',
    billingCycle,
    startDate: now,
    currentPeriodEnd,
    graceEndsAt,
    trialEndsAt: null,
    canceledAt: null,
    userLimit: plan?.userLimit ?? null,
    callLimit: plan?.callLimit ?? null,
    storageLimitMb: plan?.storageLimitMb ?? null,
  };
}

// Fields to persist when starting a TRIAL of `trialDays`.
export function trialFields(plan, trialDays, now = new Date()) {
  return {
    status: 'TRIAL',
    startDate: now,
    trialEndsAt: new Date(now.getTime() + trialDays * DAY_MS),
    currentPeriodEnd: null,
    graceEndsAt: null,
    canceledAt: null,
    userLimit: plan?.userLimit ?? null,
    callLimit: plan?.callLimit ?? null,
    storageLimitMb: plan?.storageLimitMb ?? null,
  };
}

// Extend the current paid period (renewal / manual extension) by `days`.
export function extendFields(sub, days, now = new Date()) {
  const base = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now ? new Date(sub.currentPeriodEnd) : now;
  const currentPeriodEnd = new Date(base.getTime() + days * DAY_MS);
  return {
    status: 'ACTIVE',
    currentPeriodEnd,
    graceEndsAt: new Date(currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS),
    canceledAt: null,
  };
}
