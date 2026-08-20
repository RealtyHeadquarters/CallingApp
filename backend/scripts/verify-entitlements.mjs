// Phase 4 verification: feature entitlements (plan → features → requireFeature)
// and granular permissions (role → permissions → requirePermission).
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE || 'http://localhost:4055/api';
const SA_PASSWORD = process.env.SA_PASSWORD;
const SA_EMAIL = process.env.SA_EMAIL || 'superadmin@procallingapp.com';
if (!SA_PASSWORD) { console.error('Set SA_PASSWORD'); process.exit(2); }

const prisma = new PrismaClient();
const results = [];
const check = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const call = (m, p, { tok, body } = {}) => fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(j);

async function main() {
  const sa = (await call('POST', '/auth/login', { body: { identifier: SA_EMAIL, password: SA_PASSWORD } })).body.token;
  const plans = (await call('GET', '/admin/plans', { tok: sa })).body.data;
  const starter = plans.find((p) => p.code === 'STARTER');
  const business = plans.find((p) => p.code === 'BUSINESS');

  const stamp = `${Date.now()}`;
  const onboard = await call('POST', '/admin/tenants', { tok: sa, body: {
    company: { name: `Ent Test ${stamp}` },
    admin: { name: 'Ent Admin', email: `ent${stamp}@t.com`, mobile: `EN${stamp}`, password: 'ent-pass-1234' },
    subscription: { planId: starter.id, billingCycle: 'MONTHLY' }, // STARTER: CRM, CALLING, EXPORT only
  } });
  const tid = onboard.body?.tenant?.id;
  const adminTok = (await call('POST', '/auth/login', { body: { identifier: `ent${stamp}@t.com`, password: 'ent-pass-1234' } })).body.token;

  // ── Feature entitlements (STARTER plan) ─────────────────────────────────────
  const me = await call('GET', '/auth/me', { tok: adminTok });
  const feats = me.body?.features || [];
  check('STARTER admin has EXPORT feature', feats.includes('EXPORT'), feats.join(','));
  check('STARTER admin lacks ADVANCED_REPORTS', !feats.includes('ADVANCED_REPORTS'));
  check('STARTER admin lacks BULK_IMPORT', !feats.includes('BULK_IMPORT'));
  check('/auth/me returns permissions', Array.isArray(me.body?.permissions) && me.body.permissions.includes('user.create'));

  const reports = await call('GET', '/reports/analytics', { tok: adminTok });
  check('reports blocked without ADVANCED_REPORTS (403)', reports.status === 403 && reports.body?.error?.details?.code === 'FEATURE_NOT_IN_PLAN', `status ${reports.status}`);
  const imp = await call('POST', '/leads/import', { tok: adminTok });
  check('import blocked without BULK_IMPORT (403)', imp.status === 403 && imp.body?.error?.details?.code === 'FEATURE_NOT_IN_PLAN', `status ${imp.status}`);
  const exp = await call('GET', '/exports/calls', { tok: adminTok });
  check('export allowed with EXPORT feature (200)', exp.status === 200, `status ${exp.status}`);

  // Upgrade to BUSINESS → reports now allowed
  await call('PUT', `/admin/tenants/${tid}/subscription`, { tok: sa, body: { planId: business.id, billingCycle: 'MONTHLY' } });
  const reports2 = await call('GET', '/reports/analytics', { tok: adminTok });
  check('reports allowed after upgrade to BUSINESS (200)', reports2.status === 200, `status ${reports2.status}`);

  // Tenant feature override: super admin removes EXPORT for this tenant
  await call('PATCH', `/admin/tenants/${tid}/features`, { tok: sa, body: { overrides: { EXPORT: false } } });
  const exp2 = await call('GET', '/exports/calls', { tok: adminTok });
  check('export blocked after tenant override removes EXPORT (403)', exp2.status === 403, `status ${exp2.status}`);

  // ── Granular permissions ────────────────────────────────────────────────────
  const agentCreate = await call('POST', '/users', { tok: adminTok, body: { name: 'Agent One', email: `ag${stamp}@t.com`, mobile: `AG${stamp}`, password: 'agent-pass-1', role: 'AGENT' } });
  check('admin can create an agent (201)', agentCreate.status === 201, `status ${agentCreate.status}`);
  const agentTok = (await call('POST', '/auth/login', { body: { identifier: `ag${stamp}@t.com`, password: 'agent-pass-1' } })).body.token;

  const agentMe = await call('GET', '/auth/me', { tok: agentTok });
  check('agent permissions exclude lead.create + user.view', !agentMe.body.permissions.includes('lead.create') && !agentMe.body.permissions.includes('user.view'), agentMe.body.permissions.join(','));

  const agentLead = await call('POST', '/leads', { tok: agentTok, body: { name: 'x', mobile: `AL${stamp}` } });
  check('agent cannot create lead (403)', agentLead.status === 403, `status ${agentLead.status}`);
  const agentUsers = await call('GET', '/users', { tok: agentTok });
  check('agent cannot list users (403)', agentUsers.status === 403, `status ${agentUsers.status}`);
  const agentLeadList = await call('GET', '/leads', { tok: agentTok });
  check('agent CAN read leads (200)', agentLeadList.status === 200, `status ${agentLeadList.status}`);

  await prisma.tenant.deleteMany({ where: { id: tid } });
  check('cleanup: test tenant removed', true, `tenants left: ${await prisma.tenant.count()}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.n)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
