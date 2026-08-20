import { AsyncLocalStorage } from 'node:async_hooks';

// ── Per-request tenant context ──────────────────────────────────────────────
// The Prisma extension (lib/prisma.js) reads this store to scope EVERY query on
// a tenant-owned model to the current tenant. Tenant isolation is enforced here,
// server-side — never from a tenantId sent by the client.
//
// When there is NO store (login, webhooks, startup, ad-hoc scripts) queries run
// UNSCOPED; code on those paths must scope/parameterize explicitly.
export const tenantStore = new AsyncLocalStorage();

// Shape of a store entry:
//   { tenantId: string|null, role: string, userId: string|null, bypassTenant: boolean }
//   bypassTenant=true  → no auto-scoping (SUPER_ADMIN / platform jobs)
//   tenantId set, bypass=false → scope all queries to that tenant

export function getTenantContext() {
  return tenantStore.getStore() || null;
}

export function getTenantId() {
  const s = tenantStore.getStore();
  return s ? s.tenantId : null;
}

// Establish context for an authenticated request and run the rest of the chain
// inside it. Called from the auth middleware.
export function runWithContext(ctx, next) {
  return tenantStore.run(ctx, next);
}

// Run a background job AS a specific tenant (e.g. per-tenant daily summary).
// All queries inside `fn` are scoped to `tenantId`.
// IMPORTANT: `fn` MUST await its DB work inside the callback. Returning a lazy
// PrismaPromise to be awaited by the caller loses the context (the query would
// then run unscoped). e.g. `runAsTenant(id, async () => { return await prisma... })`.
export function runAsTenant(tenantId, fn) {
  return tenantStore.run({ tenantId, role: 'SYSTEM', userId: null, bypassTenant: false }, fn);
}

// Run with scoping disabled (platform-level jobs / super admin console).
export function runUnscoped(fn) {
  return tenantStore.run({ tenantId: null, role: 'SUPER_ADMIN', userId: null, bypassTenant: true }, fn);
}
