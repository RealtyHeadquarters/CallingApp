import { prisma } from '../lib/prisma.js';
import { runAsTenant } from '../lib/tenantContext.js';
import { notify } from './notifier.js';
import { computeCallStats, formatDuration } from '../utils/stats.js';

// Minutes before a follow-up to send a reminder (spec §33 — configurable).
const REMINDER_LEAD_MINUTES = Number(process.env.REMINDER_LEAD_MINUTES || 30);
const TICK_MS = Number(process.env.SCHEDULER_TICK_MS || 60_000);
// Hours after which an unactioned overdue follow-up is marked MISSED.
const MISSED_AFTER_HOURS = Number(process.env.MISSED_AFTER_HOURS || 24);

const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

// One pass of the reminder job. Exported so it can be unit-tested / triggered.
export async function runReminderTick(now = new Date()) {
  const soon = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);

  // 1) Upcoming follow-ups entering the reminder window (not yet reminded).
  const dueSoon = await prisma.followUp.findMany({
    where: { status: 'PENDING', reminderSent: false, followupAt: { gt: now, lte: soon } },
    select: { id: true, userId: true, tenantId: true, followupAt: true, client: { select: { name: true } } },
    take: 500,
  });
  for (const f of dueSoon) {
    await notify({
      userId: f.userId,
      tenantId: f.tenantId,
      type: 'FOLLOWUP_REMINDER',
      title: `Follow-up soon: ${f.client?.name ?? 'client'}`,
      body: `Scheduled at ${f.followupAt.toLocaleString()}`,
      entityType: 'FollowUp',
      entityId: f.id,
    });
    await prisma.followUp.update({ where: { id: f.id }, data: { reminderSent: true } });
  }

  // 2) Overdue follow-ups (past due, still pending, not yet notified).
  const overdue = await prisma.followUp.findMany({
    where: { status: 'PENDING', overdueNotified: false, followupAt: { lt: now } },
    select: { id: true, userId: true, tenantId: true, client: { select: { name: true } } },
    take: 500,
  });
  for (const f of overdue) {
    await notify({
      userId: f.userId,
      tenantId: f.tenantId,
      type: 'FOLLOWUP_OVERDUE',
      title: `Overdue follow-up: ${f.client?.name ?? 'client'}`,
      body: 'This follow-up is past its scheduled time.',
      entityType: 'FollowUp',
      entityId: f.id,
    });
    await prisma.followUp.update({ where: { id: f.id }, data: { overdueNotified: true } });
  }

  // 3) Long-overdue follow-ups become MISSED.
  const missedCutoff = new Date(now.getTime() - MISSED_AFTER_HOURS * 3600_000);
  const missed = await prisma.followUp.updateMany({
    where: { status: 'PENDING', followupAt: { lt: missedCutoff } },
    data: { status: 'MISSED' },
  });

  // 4) Once per day, send an org summary to admins/managers (spec §45).
  const daily = await runDailySummaryIfDue(now);

  return { reminded: dueSoon.length, overdue: overdue.length, missed: missed.count, daily };
}

// Sends a summary of the previous day to every admin/manager, at most once per day.
// Uses a persisted Counter row so it survives restarts.
async function runDailySummaryIfDue(now) {
  const todayKey = dayKey(now);
  const marker = await prisma.counter.findUnique({ where: { key: 'daily_summary_day' } });
  if (marker && marker.value >= todayKey) return { sent: 0 };

  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
  const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
  const dateLabel = start.toISOString().slice(0, 10);

  // Summaries are computed PER TENANT — one tenant's numbers must never mix with
  // another's. runAsTenant scopes every query below to that tenant.
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    select: { id: true },
  });

  let sent = 0;
  for (const t of tenants) {
    sent += await runAsTenant(t.id, async () => {
      const [stats, converted, missedCount, recipients] = await Promise.all([
        computeCallStats(prisma, { createdAt: { gte: start, lte: end } }),
        prisma.client.count({ where: { leadStatus: 'CONVERTED', updatedAt: { gte: start, lte: end } } }),
        prisma.followUp.count({ where: { status: 'MISSED', updatedAt: { gte: start, lte: end } } }),
        prisma.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER'] }, status: 'ACTIVE' }, select: { id: true } }),
      ]);
      if (recipients.length === 0) return 0;

      const body =
        `Calls ${stats.totalCalls} · Answered ${stats.answeredCalls} (${stats.answerRate}%) · ` +
        `Talk ${formatDuration(stats.totalTalkTimeSeconds)} · Converted ${converted} · Missed follow-ups ${missedCount}`;

      for (const r of recipients) {
        await notify({ userId: r.id, type: 'DAILY_SUMMARY', title: `Daily summary — ${dateLabel}`, body });
        if (missedCount > 0) {
          await notify({ userId: r.id, type: 'MISSED_FOLLOWUPS', title: `${missedCount} missed follow-up(s) yesterday`, body: 'Review overdue follow-ups.' });
        }
      }
      return recipients.length;
    });
  }

  await prisma.counter.upsert({
    where: { key: 'daily_summary_day' },
    create: { key: 'daily_summary_day', value: todayKey },
    update: { value: todayKey },
  });
  return { sent };
}

let timer = null;

// Start the background scheduler. Safe no-op if already running.
export function startScheduler() {
  if (timer) return;
  const tick = async () => {
    try {
      await runReminderTick();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('scheduler tick failed:', e.message);
    }
  };
  timer = setInterval(tick, TICK_MS);
  if (timer.unref) timer.unref(); // don't keep the process alive just for this
  // eslint-disable-next-line no-console
  console.log(`Reminder scheduler started (every ${TICK_MS / 1000}s, ${REMINDER_LEAD_MINUTES}m lead).`);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
