import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { serializeSubscription } from './subscription.service.js';
import { getUsage } from '../../services/usage.js';

// The caller's OWN subscription + current usage (auto-scoped to their tenant).
export const getMySubscription = asyncHandler(async (req, res) => {
  const sub = await prisma.subscription.findFirst({ include: { plan: true } });
  const limits = { users: sub?.userLimit ?? null, calls: sub?.callLimit ?? null, storageMb: sub?.storageLimitMb ?? null };
  const usage = await getUsage(req.tenantId, sub, limits);
  res.json({ subscription: serializeSubscription(sub), usage });
});

// Active plan catalog (for upgrade prompts). Plans are global.
export const listAvailablePlans = asyncHandler(async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  res.json({ data: plans });
});
