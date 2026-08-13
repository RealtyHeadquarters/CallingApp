import { Router } from 'express';
import { db, COL } from '../admin.js';
import { getById, findMany, ts } from '../lib/repo.js';
import { asyncHandler } from '../lib/framework.js';
import { authenticate, requireRole } from '../auth.js';
import { statsFromCalls, formatDuration } from '../lib/stats.js';

const router = Router();
router.use(authenticate);

function todayBounds() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
}

// Agent dashboard (spec §5)
router.get('/agent', asyncHandler(async (req, res) => {
  const { start, end } = todayBounds();
  const calls = await findMany(COL.calls, (c) =>
    c.where('userId', '==', req.user.id).where('createdAt', '>=', ts(start)).where('createdAt', '<=', ts(end)));
  const stats = statsFromCalls(calls);

  const [todayFollow, pendingFollow, user] = await Promise.all([
    db.collection(COL.followUps).where('userId', '==', req.user.id).where('status', '==', 'PENDING')
      .where('followupAt', '>=', ts(start)).where('followupAt', '<=', ts(end)).count().get(),
    db.collection(COL.followUps).where('userId', '==', req.user.id).where('status', '==', 'PENDING').count().get(),
    getById(COL.users, req.user.id),
  ]);

  let targets = null;
  if (user?.dailyCallTarget || user?.dailyTalktimeTarget) {
    targets = {
      calls: user.dailyCallTarget ? { done: stats.totalCalls, target: user.dailyCallTarget } : null,
      talkTime: user.dailyTalktimeTarget ? {
        doneSeconds: stats.totalTalkTimeSeconds, targetSeconds: user.dailyTalktimeTarget,
        done: formatDuration(stats.totalTalkTimeSeconds), target: formatDuration(user.dailyTalktimeTarget),
      } : null,
    };
  }

  res.json({
    date: new Date().toISOString().slice(0, 10),
    kpis: stats,
    followUps: { today: todayFollow.data().count, pending: pendingFollow.data().count },
    targets,
  });
}));

// Admin/org dashboard (spec §26)
router.get('/admin', requireRole('ADMIN', 'MANAGER'), asyncHandler(async (_req, res) => {
  const { start, end } = todayBounds();
  const allCalls = await findMany(COL.calls);
  const stats = statsFromCalls(allCalls);

  const [totalLeads, totalUsers, activeUsers, converted, todayFollow, pendingFollow] = await Promise.all([
    db.collection(COL.clients).count().get(),
    db.collection(COL.users).count().get(),
    db.collection(COL.users).where('status', '==', 'ACTIVE').count().get(),
    db.collection(COL.clients).where('leadStatus', '==', 'CONVERTED').count().get(),
    db.collection(COL.followUps).where('status', '==', 'PENDING').where('followupAt', '>=', ts(start)).where('followupAt', '<=', ts(end)).count().get(),
    db.collection(COL.followUps).where('status', '==', 'PENDING').count().get(),
  ]);
  const overdue = await db.collection(COL.followUps).where('status', '==', 'PENDING').where('followupAt', '<', ts(new Date())).count().get();

  res.json({
    organization: {
      totalLeads: totalLeads.data().count,
      totalUsers: totalUsers.data().count,
      activeUsers: activeUsers.data().count,
      convertedLeads: converted.data().count,
      ...stats,
    },
    followUps: { today: todayFollow.data().count, pending: pendingFollow.data().count, overdue: overdue.data().count },
  });
}));

export default router;
