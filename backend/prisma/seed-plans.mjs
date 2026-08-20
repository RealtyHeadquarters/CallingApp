// Seed the default plan catalog + give the primary tenant an active Enterprise
// subscription (so the live app is never restricted). Idempotent.
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PLAN_FEATURES } from '../src/config/features.js';

const prisma = new PrismaClient();

// Prices in paise (₹). null limit = unlimited. features from the catalog defaults.
const PLANS = [
  { code: 'STARTER', name: 'Starter', priceMonthly: 99900, priceYearly: 999000, userLimit: 5, callLimit: 5000, storageLimitMb: 512, sortOrder: 1, features: DEFAULT_PLAN_FEATURES.STARTER },
  { code: 'BUSINESS', name: 'Business', priceMonthly: 299900, priceYearly: 2999000, userLimit: 25, callLimit: 50000, storageLimitMb: 5120, sortOrder: 2, features: DEFAULT_PLAN_FEATURES.BUSINESS },
  { code: 'ENTERPRISE', name: 'Enterprise', priceMonthly: 999900, priceYearly: 9999000, userLimit: null, callLimit: null, storageLimitMb: null, sortOrder: 3, features: DEFAULT_PLAN_FEATURES.ENTERPRISE },
];

async function main() {
  const byCode = {};
  for (const p of PLANS) {
    const existing = await prisma.subscriptionPlan.findFirst({ where: { code: p.code, name: p.name } });
    const plan = existing
      ? await prisma.subscriptionPlan.update({ where: { id: existing.id }, data: p })
      : await prisma.subscriptionPlan.create({ data: p });
    byCode[p.code] = plan;
    console.log(`✔ plan ${plan.name} (${plan.code}) ${existing ? 'updated' : 'created'}`);
  }

  const primary = await prisma.tenant.findUnique({ where: { slug: 'primary' }, select: { id: true } });
  if (primary) {
    const ent = byCode.ENTERPRISE;
    const now = new Date();
    const currentPeriodEnd = new Date(now); currentPeriodEnd.setFullYear(now.getFullYear() + 1);
    const graceEndsAt = new Date(currentPeriodEnd.getTime() + 7 * 86400000);
    const data = {
      planId: ent.id, status: 'ACTIVE', billingCycle: 'YEARLY',
      startDate: now, currentPeriodEnd, graceEndsAt, trialEndsAt: null, canceledAt: null,
      userLimit: ent.userLimit, callLimit: ent.callLimit, storageLimitMb: ent.storageLimitMb,
    };
    await prisma.subscription.upsert({
      where: { tenantId: primary.id },
      create: { tenantId: primary.id, ...data },
      update: data,
    });
    console.log(`✔ primary tenant → ENTERPRISE active until ${currentPeriodEnd.toISOString().slice(0, 10)}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
