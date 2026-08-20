import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';
import { tenantStore } from './tenantContext.js';

// Models that carry a tenantId and must be isolated per tenant.
// (Counter and PasswordResetToken are platform-level and intentionally excluded.)
const TENANT_MODELS = new Set(['User', 'Team', 'Client', 'Call', 'FollowUp', 'Notification', 'AuditLog', 'Subscription', 'Payment']);

// Operations whose `where` we scope with tenantId. Prisma 5 "extendedWhereUnique"
// lets us add tenantId even to findUnique/update/delete (which take a unique id),
// so a Tenant-A user hitting Tenant-B's id gets null / P2025 — never the row.
const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany',
]);

const base = new PrismaClient({ log: isProd ? ['error', 'warn'] : ['error', 'warn'] });

// Every tenant-owned query is auto-scoped from AsyncLocalStorage. This is the
// single source of truth for tenant isolation — no controller can forget it.
export const prisma = base.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = tenantStore.getStore();
        // No context, explicit bypass (super admin), or non-tenant model → run as-is.
        if (!ctx || ctx.bypassTenant || !TENANT_MODELS.has(model)) return query(args);

        const { tenantId } = ctx;
        if (tenantId == null) return query(args); // safety: never force a null-tenant filter

        args = args || {};
        if (WHERE_OPS.has(operation)) {
          args.where = { ...(args.where || {}), tenantId };
        } else if (operation === 'create') {
          args.data = args.data || {};
          if (args.data.tenantId === undefined) args.data.tenantId = tenantId;
        } else if (operation === 'createMany') {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          args.data = rows.map((r) => (r.tenantId === undefined ? { ...r, tenantId } : r));
        } else if (operation === 'upsert') {
          args.where = { ...(args.where || {}), tenantId };
          args.create = args.create || {};
          if (args.create.tenantId === undefined) args.create.tenantId = tenantId;
        }
        return query(args);
      },
    },
  },
});
