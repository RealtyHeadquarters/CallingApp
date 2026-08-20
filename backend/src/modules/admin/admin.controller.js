import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { hashPassword } from '../auth/auth.service.js';
import { createTenantWithAdmin } from './admin.service.js';
import {
  serializeSubscription, planPeriodFields, trialFields, extendFields,
} from '../subscriptions/subscription.service.js';
import { FEATURE_KEYS, FEATURE_LABELS } from '../../config/features.js';
import { computeFeatures } from '../../services/entitlements.js';
import { getUsage } from '../../services/usage.js';

// Feature catalog for the console (checkbox lists).
export const listFeatures = (_req, res) => {
  res.json({ features: FEATURE_KEYS.map((k) => ({ key: k, label: FEATURE_LABELS[k] })) });
};

// NOTE: every handler here runs under the SUPER_ADMIN (bypass) context, so
// Prisma queries are NOT auto-scoped — they intentionally span all tenants.
// Access to this module is gated by requireRole('SUPER_ADMIN') in the routes.

const TENANT_STATUSES = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED'];

// ── Platform overview ───────────────────────────────────────────────────────
export const platformStats = asyncHandler(async (_req, res) => {
  const [byStatus, tenantsTotal, totalUsers, totalCalls, totalLeads, recentTenants] = await Promise.all([
    prisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.tenant.count(),
    prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    prisma.call.count(),
    prisma.client.count(),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, slug: true, status: true, createdAt: true },
    }),
  ]);

  const statusCounts = TENANT_STATUSES.reduce((a, s) => ({ ...a, [s]: 0 }), {});
  for (const g of byStatus) statusCounts[g.status] = g._count._all;

  res.json({
    tenants: { total: tenantsTotal, byStatus: statusCounts },
    totals: { users: totalUsers, calls: totalCalls, leads: totalLeads },
    recentTenants,
  });
});

// ── List tenants (with per-tenant counts) ───────────────────────────────────
export const listTenantsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  search: z.string().optional(),
});

export const listTenants = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q);

  const where = {};
  if (q.status) where.status = q.status;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { slug: { contains: q.search, mode: 'insensitive' } },
      { contactEmail: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, slug: true, status: true,
        contactEmail: true, contactPhone: true, createdAt: true,
        _count: { select: { users: true, calls: true, clients: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  const data = rows.map((t) => ({
    id: t.id, name: t.name, slug: t.slug, status: t.status,
    contactEmail: t.contactEmail, contactPhone: t.contactPhone, createdAt: t.createdAt,
    users: t._count.users, calls: t._count.calls, leads: t._count.clients,
  }));
  res.json(paginated(data, total, { page, pageSize }));
});

// ── Tenant detail (+ its users) ─────────────────────────────────────────────
export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, slug: true, status: true,
      logoUrl: true, primaryColor: true, secondaryColor: true, customDomain: true,
      contactEmail: true, contactPhone: true, featureOverrides: true, createdAt: true, updatedAt: true,
      _count: { select: { users: true, calls: true, clients: true, followUps: true } },
    },
  });
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const [users, sub] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, email: true, mobile: true, role: true, status: true, createdAt: true },
    }),
    prisma.subscription.findUnique({ where: { tenantId: tenant.id }, include: { plan: true } }),
  ]);

  const limits = { users: sub?.userLimit ?? null, calls: sub?.callLimit ?? null, storageMb: sub?.storageLimitMb ?? null };
  const usage = await getUsage(tenant.id, sub, limits);

  res.json({
    tenant: {
      ...tenant,
      users: tenant._count.users,
      calls: tenant._count.calls,
      leads: tenant._count.clients,
      followUps: tenant._count.followUps,
      _count: undefined,
    },
    users,
    subscription: serializeSubscription(sub),
    usage,
    features: computeFeatures(sub?.plan || null, tenant.featureOverrides),
    featureOverrides: tenant.featureOverrides || {},
  });
});

// Per-tenant feature overrides (add/remove on top of the plan).
export const setTenantFeaturesSchema = z.object({ overrides: z.record(z.boolean()) });
export const setTenantFeatures = asyncHandler(async (req, res) => {
  const tenant = await requireTenant(req.params.id);
  const overrides = {};
  for (const [k, v] of Object.entries(req.body.overrides)) {
    if (FEATURE_KEYS.includes(k)) overrides[k] = !!v;
  }
  const updated = await prisma.tenant.update({ where: { id: tenant.id }, data: { featureOverrides: overrides }, select: { featureOverrides: true } });
  recordAudit(req, { action: 'TENANT_FEATURES', entityType: 'Tenant', entityId: tenant.id, description: `Updated feature overrides for ${tenant.name}` });
  res.json({ featureOverrides: updated.featureOverrides });
});

// ── Plan catalog (global; not tenant-scoped) ────────────────────────────────
export const listPlans = asyncHandler(async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ data: plans });
});

const planBody = {
  name: z.string().min(2),
  code: z.enum(['STARTER', 'BUSINESS', 'ENTERPRISE', 'CUSTOM']).default('CUSTOM'),
  priceMonthly: z.number().int().min(0).default(0),
  priceYearly: z.number().int().min(0).default(0),
  userLimit: z.number().int().positive().nullable().optional(),
  callLimit: z.number().int().positive().nullable().optional(),
  storageLimitMb: z.number().int().positive().nullable().optional(),
  features: z.array(z.enum(FEATURE_KEYS)).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
};
export const createPlanSchema = z.object(planBody);
export const updatePlanSchema = z.object(planBody).partial();

export const createPlan = asyncHandler(async (req, res) => {
  const plan = await prisma.subscriptionPlan.create({ data: req.body });
  recordAudit(req, { action: 'PLAN_CREATE', entityType: 'SubscriptionPlan', entityId: plan.id, description: `Created plan ${plan.name}` });
  res.status(201).json({ plan });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Plan not found');
  const plan = await prisma.subscriptionPlan.update({ where: { id: req.params.id }, data: req.body });
  recordAudit(req, { action: 'PLAN_UPDATE', entityType: 'SubscriptionPlan', entityId: plan.id, description: `Updated plan ${plan.name}` });
  res.json({ plan });
});

// ── Subscription management for a tenant ────────────────────────────────────
async function upsertSubscription(tenantId, planId, fields) {
  return prisma.subscription.upsert({
    where: { tenantId },
    create: { tenantId, planId: planId ?? null, ...fields },
    update: { planId: planId ?? undefined, ...fields },
    include: { plan: true },
  });
}

async function requireTenant(id) {
  const t = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!t) throw ApiError.notFound('Tenant not found');
  return t;
}

// Assign / renew a PAID plan.
export const assignPlanSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});
export const assignPlan = asyncHandler(async (req, res) => {
  const tenant = await requireTenant(req.params.id);
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: req.body.planId } });
  if (!plan) throw ApiError.badRequest('Plan not found');
  const sub = await upsertSubscription(tenant.id, plan.id, planPeriodFields(plan, req.body.billingCycle));
  recordAudit(req, { action: 'SUBSCRIPTION_ASSIGN', entityType: 'Tenant', entityId: tenant.id, description: `${tenant.name} → ${plan.name} (${req.body.billingCycle})` });
  res.json({ subscription: serializeSubscription(sub) });
});

// Start / restart a trial.
export const startTrialSchema = z.object({
  planId: z.string().optional(),
  trialDays: z.number().int().positive().max(365).default(14),
});
export const startTrial = asyncHandler(async (req, res) => {
  const tenant = await requireTenant(req.params.id);
  const plan = req.body.planId ? await prisma.subscriptionPlan.findUnique({ where: { id: req.body.planId } }) : null;
  const sub = await upsertSubscription(tenant.id, plan?.id ?? null, trialFields(plan, req.body.trialDays));
  recordAudit(req, { action: 'SUBSCRIPTION_TRIAL', entityType: 'Tenant', entityId: tenant.id, description: `${tenant.name} → ${req.body.trialDays}-day trial` });
  res.json({ subscription: serializeSubscription(sub) });
});

// Extend the current period (renew / grant extra time).
export const extendSchema = z.object({ days: z.number().int().positive().max(3650) });
export const extendSubscription = asyncHandler(async (req, res) => {
  const tenant = await requireTenant(req.params.id);
  const current = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!current) throw ApiError.badRequest('No subscription to extend — assign a plan first');
  const sub = await upsertSubscription(tenant.id, current.planId, extendFields(current, req.body.days));
  recordAudit(req, { action: 'SUBSCRIPTION_EXTEND', entityType: 'Tenant', entityId: tenant.id, description: `${tenant.name} extended ${req.body.days}d` });
  res.json({ subscription: serializeSubscription(sub) });
});

// Cancel (data preserved; becomes read-only).
export const cancelSubscription = asyncHandler(async (req, res) => {
  const tenant = await requireTenant(req.params.id);
  const current = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!current) throw ApiError.badRequest('No subscription to cancel');
  const sub = await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'CANCELLED', canceledAt: new Date() },
    include: { plan: true },
  });
  recordAudit(req, { action: 'SUBSCRIPTION_CANCEL', entityType: 'Tenant', entityId: tenant.id, description: `${tenant.name} subscription cancelled` });
  res.json({ subscription: serializeSubscription(sub) });
});

// ── Onboard a new client (tenant + first admin) ─────────────────────────────
export const createTenantSchema = z.object({
  company: z.object({
    name: z.string().min(2, 'Company name is required'),
    slug: z.string().min(2).optional(),
    status: z.enum(['ACTIVE', 'TRIAL']).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
  }),
  admin: z.object({
    name: z.string().min(2, 'Admin name is required'),
    email: z.string().email().transform((s) => s.toLowerCase()),
    mobile: z.string().min(6),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
  // Optional starting subscription. Default: 14-day trial (no plan).
  subscription: z.object({
    planId: z.string().optional(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
    trialDays: z.number().int().positive().max(365).optional(),
  }).optional(),
});

export const createTenant = asyncHandler(async (req, res) => {
  const { tenant, admin } = await createTenantWithAdmin(req.body);

  // Give the new tenant a starting subscription so lifecycle/limits apply from day 1.
  const s = req.body.subscription || {};
  const plan = s.planId ? await prisma.subscriptionPlan.findUnique({ where: { id: s.planId } }) : null;
  const fields = plan && !s.trialDays
    ? planPeriodFields(plan, s.billingCycle || 'MONTHLY')
    : trialFields(plan, s.trialDays || 14);
  const subscription = await prisma.subscription.create({
    data: { tenantId: tenant.id, planId: plan?.id ?? null, ...fields },
    include: { plan: true },
  });

  recordAudit(req, {
    action: 'TENANT_CREATE',
    entityType: 'Tenant',
    entityId: tenant.id,
    description: `Onboarded ${tenant.name} (admin ${admin.email}, ${subscription.status})`,
  });
  res.status(201).json({ tenant, admin, subscription: serializeSubscription(subscription) });
});

// ── Update tenant profile / branding ────────────────────────────────────────
export const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  secondaryColor: z.string().nullable().optional(),
  customDomain: z.string().nullable().optional(),
});

export const updateTenant = asyncHandler(async (req, res) => {
  const existing = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Tenant not found');
  const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: req.body });
  recordAudit(req, { action: 'TENANT_UPDATE', entityType: 'Tenant', entityId: tenant.id, description: `Updated ${tenant.name}` });
  res.json({ tenant });
});

// ── Activate / suspend a tenant ─────────────────────────────────────────────
export const setTenantStatusSchema = z.object({ status: z.enum(TENANT_STATUSES) });

export const setTenantStatus = asyncHandler(async (req, res) => {
  const existing = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!existing) throw ApiError.notFound('Tenant not found');
  const tenant = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { status: req.body.status },
  });
  recordAudit(req, {
    action: 'TENANT_STATUS',
    entityType: 'Tenant',
    entityId: tenant.id,
    description: `Set ${tenant.name} → ${req.body.status}`,
  });
  res.json({ tenant });
});

// ── Add a user to a specific tenant ─────────────────────────────────────────
export const createTenantUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  mobile: z.string().min(6),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).default('AGENT'), // never SUPER_ADMIN
});

export const createTenantUser = asyncHandler(async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email: req.body.email }, { mobile: req.body.mobile }] },
    select: { id: true },
  });
  if (clash) throw ApiError.badRequest('A user with this email or mobile already exists');

  const user = await prisma.user.create({
    data: {
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile,
      passwordHash: await hashPassword(req.body.password),
      role: req.body.role,
      status: 'ACTIVE',
      tenantId: tenant.id, // explicit — super admin context does not auto-scope
    },
    select: { id: true, name: true, email: true, mobile: true, role: true, status: true },
  });
  recordAudit(req, { action: 'USER_CREATE', entityType: 'User', entityId: user.id, description: `Added ${user.email} to tenant ${tenant.id}` });
  res.status(201).json({ user });
});

// ── Reset a tenant user's password (support action) ─────────────────────────
export const resetUserPasswordSchema = z.object({ password: z.string().min(8) });

export const resetTenantUserPassword = asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: id }, select: { id: true, email: true } });
  if (!user) throw ApiError.notFound('User not found in this tenant');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(req.body.password) } });
  recordAudit(req, { action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: user.id, description: `Reset password for ${user.email}` });
  res.json({ success: true });
});
