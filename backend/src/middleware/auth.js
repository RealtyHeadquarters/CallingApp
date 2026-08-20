import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { runWithContext } from '../lib/tenantContext.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
