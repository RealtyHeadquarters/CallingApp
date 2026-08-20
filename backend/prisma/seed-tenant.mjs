// Phase 1 migration: create the first tenant, backfill all existing rows into it,
// and create the platform Super Admin (tenantId = null).
// Idempotent — safe to run multiple times.
//
// Env overrides (optional):
//   TENANT_NAME, TENANT_SLUG
//   SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_MOBILE, SUPER_ADMIN_PASSWORD
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const TENANT_NAME = process.env.TENANT_NAME || 'Primary Organization';
const TENANT_SLUG = process.env.TENANT_SLUG || 'primary';

const SA_NAME = process.env.SUPER_ADMIN_NAME || 'Super Admin';
const SA_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@procallingapp.com';
const SA_MOBILE = process.env.SUPER_ADMIN_MOBILE || '9999999999';
const SA_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');

async function main() {
  // 1) First tenant (the current company). Upsert by slug.
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: { name: TENANT_NAME, slug: TENANT_SLUG, status: 'ACTIVE' },
  });
  console.log(`✔ Tenant: ${tenant.name} (${tenant.id})`);

  // 2) Backfill every existing tenant-owned row that has no tenant yet.
  //    Never touch SUPER_ADMIN users (they stay tenantId = null).
  const backfill = {};
  backfill.users = (await prisma.user.updateMany({
    where: { tenantId: null, role: { not: 'SUPER_ADMIN' } },
    data: { tenantId: tenant.id },
  })).count;
  backfill.teams = (await prisma.team.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })).count;
  backfill.clients = (await prisma.client.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })).count;
  backfill.calls = (await prisma.call.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })).count;
  backfill.followUps = (await prisma.followUp.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })).count;
  backfill.notifications = (await prisma.notification.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })).count;
  backfill.auditLogs = (await prisma.auditLog.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })).count;
  console.log('✔ Backfilled →', JSON.stringify(backfill));

  // 3) Super Admin (platform owner). Upsert by email; tenantId stays null.
  const existing = await prisma.user.findUnique({ where: { email: SA_EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { email: SA_EMAIL },
      data: { role: 'SUPER_ADMIN', tenantId: null, status: 'ACTIVE' },
    });
    console.log(`✔ Super Admin already exists: ${SA_EMAIL} (role/tenant reaffirmed; password unchanged)`);
  } else {
    const passwordHash = await bcrypt.hash(SA_PASSWORD, 10);
    await prisma.user.create({
      data: {
        name: SA_NAME, email: SA_EMAIL, mobile: SA_MOBILE,
        passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE', tenantId: null,
      },
    });
    console.log('\n──────────────── SUPER ADMIN CREATED ────────────────');
    console.log(`  Email:    ${SA_EMAIL}`);
    console.log(`  Mobile:   ${SA_MOBILE}`);
    console.log(`  Password: ${SA_PASSWORD}`);
    console.log('  ⚠ Save this now and change it after first login.');
    console.log('─────────────────────────────────────────────────────\n');
  }

  // 4) Verify: no tenant-owned row left unassigned.
  const orphans = {
    users: await prisma.user.count({ where: { tenantId: null, role: { not: 'SUPER_ADMIN' } } }),
    clients: await prisma.client.count({ where: { tenantId: null } }),
    calls: await prisma.call.count({ where: { tenantId: null } }),
    followUps: await prisma.followUp.count({ where: { tenantId: null } }),
  };
  console.log('✔ Orphan check (should all be 0):', JSON.stringify(orphans));
  if (Object.values(orphans).some((n) => n > 0)) throw new Error('Backfill incomplete — orphan rows remain.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
