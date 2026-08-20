import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../auth/auth.service.js';
import { ApiError } from '../../utils/apiError.js';

// URL/DB-safe slug from a company name.
export function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}

// A slug guaranteed unique across tenants (appends -2, -3, … on collision).
export async function uniqueSlug(base) {
  const root = slugify(base);
  let slug = root;
  let n = 1;
  // Tenant isn't tenant-scoped, so this findUnique sees all tenants.
  while (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}

// Onboard a client: create the tenant + its first Client Admin in one transaction.
// Runs under the super admin (bypass) context, so tenantId is set EXPLICITLY here.
export async function createTenantWithAdmin({ company, admin }) {
  // Login identifiers are globally unique — reject clashes with a clear message.
  const clash = await prisma.user.findFirst({
    where: { OR: [{ email: admin.email }, { mobile: admin.mobile }] },
    select: { id: true },
  });
  if (clash) throw ApiError.badRequest('A user with this email or mobile already exists');

  const slug = await uniqueSlug(company.slug || company.name);
  const passwordHash = await hashPassword(admin.password); // hash outside the tx (bcrypt is slow)

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: company.name,
        slug,
        status: company.status || 'ACTIVE',
        contactEmail: company.contactEmail || admin.email,
        contactPhone: company.contactPhone || admin.mobile,
      },
    });
    const user = await tx.user.create({
      data: {
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        passwordHash,
        role: 'ADMIN', // client/org admin (never SUPER_ADMIN via onboarding)
        status: 'ACTIVE',
        tenantId: tenant.id,
      },
      select: { id: true, name: true, email: true, mobile: true, role: true },
    });
    return { tenant, admin: user };
  });
}
