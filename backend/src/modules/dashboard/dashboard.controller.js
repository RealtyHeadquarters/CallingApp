import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { computeCallStats, formatDuration } from '../../utils/stats.js';

function todayRange() {
  const now = new Date();
  return {
    gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    lte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
}

// Agent dashboard — today's performance (spec §5).
export const agentDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = todayRange();

  const [stats, user, todaysFollowups, pendingFollowups] = await Promise.all([
    computeCallStats(prisma, { userId, createdAt: today }),
    prisma.user.findUnique({ where: { id: userId }, select: { dailyCallTarget: true, dailyTalktimeTarget: true } }),
    prisma.followUp.count({ where: { userId, status: 'PENDING', followupAt: today } }),
    prisma.followUp.count({ where: { userId, status: 'PENDING' } }),
  ]);

  // Target progress (spec §29) — only present if configured.
  let targets = null;
  if (user?.dailyCallTarget || user?.dailyTalktimeTarget) {
    targets = {
      calls: user.dailyCallTarget
        ? { done: stats.totalCalls, target: user.dailyCallTarget }
        : null,
      talkTime: user.dailyTalktimeTarget
        ? {
            doneSeconds: stats.totalTalkTimeSeconds,
            targetSeconds: user.dailyTalktimeTarget,
            done: formatDuration(stats.totalTalkTimeSeconds),
            target: formatDuration(user.dailyTalktimeTarget),
          }
        : null,
    };
  }

  res.json({
    date: new Date().toISOString().slice(0, 10),
    kpis: stats,
    followUps: { today: todaysFollowups, pending: pendingFollowups },
    targets,
  });
});

// Admin/org dashboard (spec §26).
export const adminDashboard = asyncHandler(async (_req, res) => {
  const today = todayRange();

  const [
    totalLeads, totalUsers, activeUsers, convertedLeads,
    allTimeStats, todaysFollowups, pendingFollowups, overdueFollowups,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.client.count({ where: { leadStatus: 'CONVERTED' } }),
    computeCallStats(prisma, {}),
    prisma.followUp.count({ where: { status: 'PENDING', followupAt: today } }),
    prisma.followUp.count({ where: { status: 'PENDING' } }),
    prisma.followUp.count({ where: { status: 'PENDING', followupAt: { lt: new Date() } } }),
  ]);

  res.json({
    organization: {
      totalLeads,
      totalUsers,
      activeUsers,
      convertedLeads,
      ...allTimeStats,
    },
    followUps: {
      today: todaysFollowups,
      pending: pendingFollowups,
      overdue: overdueFollowups,
    },
  });
});
