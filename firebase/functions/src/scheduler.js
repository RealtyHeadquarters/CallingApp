import { db, COL, Timestamp } from './admin.js';
import { findMany } from './lib/repo.js';
import { notify } from './notifier.js';
import { statsFromCalls, formatDuration } from './lib/stats.js';

const REMINDER_LEAD_MINUTES = Number(process.env.REMINDER_LEAD_MINUTES || 30);
const MISSED_AFTER_HOURS = Number(process.env.MISSED_AFTER_HOURS || 24);
const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

// Runs on a schedule (spec §33/§45): reminders, overdue alerts, mark missed, daily summary.
export async function runReminderTick(now = new Date()) {
  const soon = Timestamp.fromDate(new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000));
  const nowTs = Timestamp.fromDate(now);

  // 1) Upcoming reminders.
  const dueSoon = await findMany(COL.followUps, (c) =>
    c.where('status', '==', 'PENDING').where('reminderSent', '==', false)
      .where('followupAt', '>', nowTs).where('followupAt', '<=', soon));
  for (const f of dueSoon) {
    const client = f.clientId ? (await db.collection(COL.clients).doc(f.clientId).get()).data() : null;
    await notify({ userId: f.userId, type: 'FOLLOWUP_REMINDER', title: `Follow-up soon: ${client?.name ?? 'client'}`, body: `Scheduled at ${new Date(f.followupAt).toLocaleString()}`, entityType: 'FollowUp', entityId: f.id });
    await db.collection(COL.followUps).doc(f.id).set({ reminderSent: true }, { merge: true });
  }

  // 2) Overdue alerts.
  const overdue = await findMany(COL.followUps, (c) =>
    c.where('status', '==', 'PENDING').where('overdueNotified', '==', false).where('followupAt', '<', nowTs));
  for (const f of overdue) {
    const client = f.clientId ? (await db.collection(COL.clients).doc(f.clientId).get()).data() : null;
    await notify({ userId: f.userId, type: 'FOLLOWUP_OVERDUE', title: `Overdue follow-up: ${client?.name ?? 'client'}`, body: 'This follow-up is past its scheduled time.', entityType: 'FollowUp', entityId: f.id });
    await db.collection(COL.followUps).doc(f.id).set({ overdueNotified: true }, { merge: true });
  }

  // 3) Long-overdue -> MISSED.
  const missedCutoff = Timestamp.fromDate(new Date(now.getTime() - MISSED_AFTER_HOURS * 3600_000));
  const toMiss = await findMany(COL.followUps, (c) =>
    c.where('status', '==', 'PENDING').where('followupAt', '<', missedCutoff));
  for (const f of toMiss) await db.collection(COL.followUps).doc(f.id).set({ status: 'MISSED' }, { merge: true });

  // 4) Daily summary (once per day).
  await runDailySummaryIfDue(now);
  return { reminded: dueSoon.length, overdue: overdue.length, missed: toMiss.length };
}

async function runDailySummaryIfDue(now) {
  const todayKey = dayKey(now);
  const markerRef = db.collection(COL.counters).doc('daily_summary_day');
  const marker = await markerRef.get();
  if (marker.exists && marker.data().value >= todayKey) return;

  const y = new Date(now); y.setDate(y.getDate() - 1);
  const start = Timestamp.fromDate(new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0));
  const end = Timestamp.fromDate(new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999));

  const calls = await findMany(COL.calls, (c) => c.where('createdAt', '>=', start).where('createdAt', '<=', end));
  const stats = statsFromCalls(calls);
  const missed = await db.collection(COL.followUps).where('status', '==', 'MISSED').count().get();
  const recipients = await findMany(COL.users, (c) => c.where('status', '==', 'ACTIVE'));
  const admins = recipients.filter((u) => u.role === 'ADMIN' || u.role === 'MANAGER');

  const dateLabel = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString().slice(0, 10);
  const body = `Calls ${stats.totalCalls} · Answered ${stats.answeredCalls} (${stats.answerRate}%) · Talk ${formatDuration(stats.totalTalkTimeSeconds)}`;
  for (const r of admins) {
    await notify({ userId: r.id, type: 'DAILY_SUMMARY', title: `Daily summary — ${dateLabel}`, body });
    if (missed.data().count > 0) await notify({ userId: r.id, type: 'MISSED_FOLLOWUPS', title: `${missed.data().count} missed follow-up(s)`, body: 'Review overdue follow-ups.' });
  }
  await markerRef.set({ value: todayKey }, { merge: true });
}
