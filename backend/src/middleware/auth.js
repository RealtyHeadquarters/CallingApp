import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { runWithContext } from '../lib/tenantContext.js';
import { resolveSubscription } from '../modules/subscriptions/subscription.service.js';
import { computeFeatures, computePermissions } from '../services/entitlements.js';
import { FEATURE_KEYS } from '../config/features.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// When a subscription is read-only (EXPIRED/CANCELLED), only these path prefixes
// and safe (read) methods stay usable so the client can still see data + billing.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALWAYS_ALLOWED = ['/api/auth', '/api/subscription', '/api/billing'];

// Verifies the Bearer token, loads the user, and attaches it to req.user.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing authentication token');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  // This lookup runs BEFORE any tenant context exists, so it is intentionally
  // unscoped — it is how we discover which tenant the caller belongs to.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
      role: true,
      status: true,
      teamId: true,
      tenantId: true,
      tenant: {
        select: {
          status: true,
          name: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          featureOverrides: true,
          subscription: {
            select: {
              status: true, billingCycle: true, startDate: true,
              currentPeriodEnd: true, trialEndsAt: true, graceEndsAt: true, canceledAt: true,
              userLimit: true, callLimit: true, storageLimitMb: true,
              plan: { select: { features: true } },
            },
          },
        },
      },
    },
  });
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is inactive');

  // A non-super-admin MUST belong to a tenant. Refuse orphaned accounts rather
  // than run an unscoped (leaky) query.
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  if (!isSuperAdmin && !user.tenantId) {
    throw ApiError.forbidden('Your account is not attached to an organization');
  }

  // A suspended organization is locked out entirely (super-admin action).
  if (!isSuperAdmin && user.tenant?.status === 'SUSPENDED') {
    throw ApiError.forbidden('Your organization has been suspended. Please contact support.');
  }

  // Subscription lifecycle: EXPIRED/CANCELLED → read-only (block writes, allow
  // reads + billing); GRACE → full access with a banner flag on req.subscription.
  const subRow = user.tenant?.subscription || null;
  const sub = resolveSubscription(subRow);
  req.subscription = sub;
  req.subscriptionRow = subRow; // raw row (dates/cycle) for usage period math
  req.limits = { users: subRow?.userLimit ?? null, calls: subRow?.callLimit ?? null, storageMb: subRow?.storageLimitMb ?? null };

  // Effective entitlements for this request: plan features (± tenant overrides)
  // and the role's granular permissions. Gated via requireFeature/requirePermission.
  req.features = isSuperAdmin ? [...FEATURE_KEYS] : computeFeatures(user.tenant?.subscription?.plan || null, user.tenant?.featureOverrides);
  req.permissions = computePermissions(user.role);
  req.branding = user.tenant
    ? { name: user.tenant.name, logoUrl: user.tenant.logoUrl, primaryColor: user.tenant.primaryColor, secondaryColor: user.tenant.secondaryColor }
    : null;
  if (!isSuperAdmin && sub.readOnly && !SAFE_METHODS.has(req.method)) {
    const path = req.originalUrl || req.url || '';
    const allowed = ALWAYS_ALLOWED.some((p) => path.startsWith(p));
    if (!allowed) {
      throw ApiError.paymentRequired('Your subscription has expired. Please renew to continue.', { code: 'SUBSCRIPTION_EXPIRED', state: sub.state });
    }
  }

  req.user = user;
  req.tenantId = user.tenantId || null;

  // Establish tenant context for the ENTIRE downstream chain. Every tenant-owned
  // Prisma query from here on is auto-scoped to this tenant (server-side).
  const ctx = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId || null,
    bypassTenant: isSuperAdmin, // super admin operates platform-wide
  };
  runWithContext(ctx, () => next());
});
