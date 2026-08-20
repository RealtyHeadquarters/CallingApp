import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { checkLimit } from '../services/usage.js';

// Block an action when the tenant is at its plan limit for `metric` ('USERS'|'CALLS').
// Super admin (no tenant) is exempt. Warnings (80/90%) are surfaced to the UI via
// the usage snapshot; this middleware is the hard 100% block.
export const enforceLimit = (metric) => asyncHandler(async (req, _res, next) => {
  if (req.user?.role === 'SUPER_ADMIN' || !req.tenantId) return next();
  const r = await checkLimit(metric, req.tenantId, req.limits, req.subscriptionRow || null);
  if (!r.allowed) {
    const noun = metric === 'USERS' ? 'user' : 'call';
    throw new ApiError(402, `You've reached your plan's ${noun} limit (${r.limit}). Please upgrade to add more.`, {
      code: 'LIMIT_REACHED', metric, used: r.used, limit: r.limit,
    });
  }
  next();
});
