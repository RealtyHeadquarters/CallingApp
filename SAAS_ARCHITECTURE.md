# ProCallingApp — Multi-Tenant SaaS Architecture & Migration Plan

Converting the existing single-tenant Calling + CRM into a production multi-tenant SaaS
(one codebase → many client organizations → subscription-controlled features → strict data isolation).

---

## 1. Current architecture (analysis)

| Layer | Today | Reuse? |
|-------|-------|--------|
| Backend | Node.js + Express + Prisma (ESM), modular (`auth, users, teams, leads, calls, followups, dashboard, reports, notifications, exports, webhooks`) on Render | ✅ Extend — do **not** rewrite |
| DB | PostgreSQL (Neon). Tables: users, teams, clients(leads), calls, follow_ups, notifications, audit_logs, counters, password_reset_tokens | ✅ Add `tenantId` + new SaaS tables |
| Auth | JWT (bcrypt), RBAC (ADMIN/MANAGER/AGENT), per-route `requireRole`, agents scoped to own data | ✅ Extend token with tenant + features |
| Web CRM | React (Vite) on Firebase Hosting, glassmorphism theme | ✅ Add Super-Admin console + gating |
| Mobile | Flutter (SIM calling, call-log sync) | ✅ Add tenant to token; mostly unchanged |

**Gap for SaaS:** no tenant concept, no super-admin layer, no subscriptions/plans, no feature entitlements, no usage metering. Isolation today is *per-user* (agent sees own data) — SaaS needs *per-tenant* isolation enforced server-side on every query.

**Key constraint:** the system is **live with real data**. Migration must backfill a default tenant and never drop data.

---

## 2. Target multi-tenant architecture

```
                       ProCallingApp SaaS
                              │
        ┌──────────────── Super Admin (platform owner = you) ───────────────┐
        │  manages tenants, plans, subscriptions, usage, feature flags       │
        └───────────────────────────────────────────────────────────────────┘
                              │
     ┌────────────────┬───────┴────────┬────────────────┐
  Tenant A          Tenant B         Tenant C   … (unlimited)
  (Client company)  subscription     subscription
     │  Client Admin → Managers → Telecallers
     └─ own users, leads, calls, follow-ups, campaigns, reports, settings, usage
```

- **Shared database, shared schema, row-level tenant isolation** (`tenantId` column on every tenant-owned table). Simplest to operate at hundreds–thousands of tenants; can shard later without app changes.
- **Tenant context is derived from the authenticated token — never from client input.**

---

## 3. Database design (additions)

New tables:
```
tenants(id, name, slug, status[ACTIVE|SUSPENDED|TRIAL|EXPIRED], logoUrl,
        primaryColor, secondaryColor, customDomain, contactEmail, contactPhone,
        createdAt, updatedAt)

subscription_plans(id, name, code[STARTER|BUSINESS|ENTERPRISE|CUSTOM], priceMonthly,
                   priceYearly, userLimit, callLimit, storageLimitMb, isActive, sortOrder)

plan_features(id, planId, featureKey, enabled)         -- what a plan includes
subscriptions(id, tenantId, planId, status[TRIAL|ACTIVE|PAST_DUE|EXPIRED|CANCELLED|SUSPENDED],
              billingCycle[MONTHLY|YEARLY], startDate, currentPeriodEnd, trialEndsAt,
              graceEndsAt, userLimit, callLimit, storageLimitMb, canceledAt)
tenant_feature_overrides(id, tenantId, featureKey, enabled)  -- per-tenant add-on/removal
payments(id, tenantId, subscriptionId, amount, currency, status, provider, providerRef, paidAt)

roles(id, tenantId?, name, isSystem)                   -- system roles + custom per-tenant
permissions(id, key)                                   -- e.g. lead.create, call.record
role_permissions(roleId, permissionId)
usage_counters(id, tenantId, period[YYYY-MM], metric[USERS|CALLS|CALLS_IN|CALLS_OUT|
               STORAGE_MB|LEADS|RECORDINGS], value)     -- fast rollups for limits
```

Existing tables get a non-null indexed **`tenantId`** (+ composite indexes `(tenantId, createdAt)` etc.):
`users, teams, clients, calls, follow_ups, notifications, audit_logs`.

`super admin` = a `User` with role `SUPER_ADMIN` and `tenantId = null` (platform-level, not a tenant member).

---

## 4. Tenant isolation (the core security mechanism)

1. **Auth middleware** loads the user → attaches `req.tenantId` (from the user's row / token), `req.user.role`, and the tenant's active **feature set**.
2. **A tenant-scoped data layer**: every tenant-owned query goes through helpers that inject `tenantId: req.tenantId` into the `where`. We add a shared `tenantWhere(req, extra)` and refactor each controller to use it (replaces today's per-user scoping, which becomes an *additional* filter for agents).
3. **Defense in depth**: even direct `findUnique(:id)` is re-checked against `tenantId`. A user from Tenant A changing an ID in the URL gets `404`, never Tenant B's row.
4. Super Admin endpoints live under `/api/admin/*` and are the **only** place tenant scoping is bypassed (guarded by `requireRole('SUPER_ADMIN')`).

---

## 5. Auth / session (SaaS flow)

```
login → find user (by email/mobile) → verify password → load tenant →
validate subscription (active/trial/grace?) → load role + permissions + features →
issue JWT { sub, tenantId, role, subStatus } → client
```
- JWT carries `tenantId`, `role`, `subStatus`. Permissions + features are loaded server-side per request (so plan/permission changes take effect immediately, not only on next login).
- Subscription-expiry middleware: `EXPIRED` → block mutating routes (allow read + billing screen); `GRACE` → allow with banner; `SUSPENDED` (by super admin) → block.

---

## 6. RBAC + feature entitlements

- **Permissions** are granular keys (`lead.view/create/edit/delete/assign/export`, `call.make/history/record/recording.download/recording.delete`, `report.view/export`, `user.view/create/edit/delete`, …). Roles map to permission sets. Not hardcoded — checked via `requirePermission('lead.create')` middleware.
- **Features** are plan-level (`CRM, CALLING, CALL_RECORDING, CAMPAIGNS, ADVANCED_REPORTS, API_ACCESS, EXPORT, …`). Effective features = plan_features ± tenant_feature_overrides. Checked via `requireFeature('CAMPAIGNS')`.
- Effective access = **feature enabled (tenant) AND permission granted (user)**.

---

## 7. Usage metering + limits

- `usage_counters` incremented on create (user added, call logged) per `tenant`+`period`.
- Enforcement middleware `enforceLimit('CALLS')` compares counter vs `subscription.callLimit` → warn at 80/90%, block at 100% (configurable), surface upgrade CTA + notify client admin.
- Nightly/rollup job recomputes counters from source tables (self-healing).

---

## 8. Super Admin console (new screens)

Platform dashboard (clients, active/trial/expired, users, calls, MRR, expiring soon) · Tenants CRUD + activate/suspend/extend · Plans CRUD · Subscriptions (assign/upgrade/downgrade/extend/trial) · Payments · Platform usage · Feature flags per tenant · Impersonate (audited).

## Client Admin / Manager / Telecaller
Existing CRM screens, now tenant-scoped + permission-gated, plus: **Subscription & Usage** page (limits, upgrade), Company settings/branding, Roles & permissions, expiry screen.

---

## 9. Migration strategy (protects live data)

1. Add `tenants`, plans, subscriptions, roles/permissions tables. Add **nullable** `tenantId` to existing tables (no break).
2. Create the **first tenant** = your current company; create a **default BUSINESS/ENTERPRISE subscription** for it.
3. **Backfill** `tenantId = <that tenant>` on all existing users/teams/clients/calls/follow_ups/notifications/audit_logs.
4. Create your **Super Admin** account (`tenantId = null`).
5. Make `tenantId` **NOT NULL** + add indexes.
6. Ship tenant-isolation middleware; refactor controllers to `tenantWhere`. Existing users keep working (they're all in tenant 1).
7. Add subscription/feature/usage gating (default: full features for tenant 1, so nothing breaks).
8. Add Super Admin console + onboarding.

Every step is additive/backward-compatible; the live app keeps working throughout.

---

## 10. Folder structure (backend additions)
```
backend/src/
  middleware/  tenant.js  requirePermission.js  requireFeature.js  subscription.js  enforceLimit.js
  modules/
    admin/        (super-admin: tenants, plans, subscriptions, payments, platform stats)
    subscriptions/ (client-facing: view sub, usage, upgrade)
    rbac/         (roles, permissions)
  services/ usage.js  entitlements.js
```

---

## 11. Roadmap (incremental phases)

- **P1 — Tenant foundation:** tenant table + tenantId everywhere + backfill migration + tenant-isolation middleware + super admin. *(no visible change; isolation live)*
- **P2 — Super Admin console:** create/list/suspend tenants, onboarding (company → plan → client admin → credentials).
- **P3 — Plans & subscriptions:** plan CRUD, assign, trial/expiry/grace, expiry screen.
- **P4 — Feature entitlements + RBAC:** feature flags + granular permissions + permission-gated UI.
- **P5 — Usage metering + limits:** counters, limit enforcement, usage dashboard.
- **P6 — Billing:** Razorpay/Stripe, payments, invoices (optional/last).
- **P7 — Polish:** white-label branding, audit expansion, super-admin analytics.

Each phase is shippable and keeps existing functionality working.
