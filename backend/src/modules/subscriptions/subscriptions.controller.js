import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { serializeSubscription } from './subscription.service.js';

// The caller's OWN subscription (auto-scoped to their tenant by the extension).
export const getMySubscription = asyncHandler(async (req, res) => {
  const sub = await prisma.subscription.findFirst({ include: { plan: true } });
  res.json({ subscription: serializeSubscription(sub) });
});

// Active plan catalog (for upgrade prompts). Plans are global.
export const listAvailablePlans = asyncHandler(async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  res.json({ data: plans });
});
