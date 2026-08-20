import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { hashPassword } from '../auth/auth.service.js';
import { createTenantWithAdmin } from './admin.service.js';

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
      contactEmail: true, contactPhone: true, createdAt: true, updatedAt: true,
      _count: { select: { users: true, calls: true, clients: true, followUps: true } },
    },
  });
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, email: true, mobile: true, role: true,
      status: true, createdAt: true,
    },
  });

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
  });
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
});

export const createTenant = asyncHandler(async (req, res) => {
  const { tenant, admin } = await createTenantWithAdmin(req.body);
  recordAudit(req, {
    action: 'TENANT_CREATE',
    entityType: 'Tenant',
    entityId: tenant.id,
    description: `Onboarded ${tenant.name} (admin ${admin.email})`,
  });
  res.status(201).json({ tenant, admin });
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
