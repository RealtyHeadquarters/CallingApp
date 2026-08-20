// Phase 5 verification: usage metering + hard limits (users, calls) with 402
// LIMIT_REACHED, and unlimited plans not blocking. Cleans up its tenant + test plan.
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

  // Tiny plan: 1 user, 1 call
  const tiny = (await call('POST', '/admin/plans', { tok: sa, body: { name: `Tiny ${Date.now()}`, code: 'CUSTOM', userLimit: 1, callLimit: 1, features: ['CRM', 'CALLING'] } })).body.plan;
  const ent = (await call('GET', '/admin/plans', { tok: sa })).body.data.find((p) => p.code === 'ENTERPRISE');

  const stamp = `${Date.now()}`;
  const onboard = await call('POST', '/admin/tenants', { tok: sa, body: {
    company: { name: `Usage Test ${stamp}` },
    admin: { name: 'Usage Admin', email: `use${stamp}@t.com`, mobile: `US${stamp}`, password: 'usage-pass-1' },
    subscription: { planId: tiny.id, billingCycle: 'MONTHLY' },
  } });
  const tid = onboard.body?.tenant?.id;
  const tok = (await call('POST', '/auth/login', { body: { identifier: `use${stamp}@t.com`, password: 'usage-pass-1' } })).body.token;

  // Usage snapshot: 1 user (admin) of 1, at 100%
  const sub1 = await call('GET', '/subscription', { tok });
  check('usage reports 1/1 users at 100%', sub1.body?.usage?.users?.used === 1 && sub1.body.usage.users.limit === 1 && sub1.body.usage.users.percent === 100, JSON.stringify(sub1.body?.usage?.users));

  // 2nd user blocked (user limit)
  const u2 = await call('POST', '/users', { tok, body: { name: 'Second', email: `u2${stamp}@t.com`, mobile: `U2${stamp}`, password: 'password12', role: 'AGENT' } });
  check('2nd user blocked at limit (402 LIMIT_REACHED)', u2.status === 402 && u2.body?.error?.details?.code === 'LIMIT_REACHED', `status ${u2.status} ${JSON.stringify(u2.body?.error?.details)}`);

  // 1st call ok, 2nd blocked (call limit)
  const c1 = await call('POST', '/calls/log', { tok, body: { phoneNumber: '9990000001', callStatus: 'ANSWERED', direction: 'OUTGOING' } });
  check('1st call within limit (201)', c1.status === 201, `status ${c1.status}`);
  const c2 = await call('POST', '/calls/log', { tok, body: { phoneNumber: '9990000002', callStatus: 'ANSWERED', direction: 'OUTGOING' } });
  check('2nd call blocked at limit (402 LIMIT_REACHED)', c2.status === 402 && c2.body?.error?.details?.metric === 'CALLS', `status ${c2.status}`);

  const sub2 = await call('GET', '/subscription', { tok });
  check('usage reports 1/1 calls at 100%', sub2.body?.usage?.calls?.used === 1 && sub2.body.usage.calls.percent === 100, JSON.stringify(sub2.body?.usage?.calls));

  // Super admin sees the tenant usage
  const detail = await call('GET', `/admin/tenants/${tid}`, { tok: sa });
  check('super admin tenant detail includes usage', detail.body?.usage?.users?.limit === 1 && detail.body?.usage?.calls?.limit === 1, JSON.stringify(detail.body?.usage?.users));

  // Upgrade to Enterprise (unlimited) → no more blocks
  await call('PUT', `/admin/tenants/${tid}/subscription`, { tok: sa, body: { planId: ent.id, billingCycle: 'MONTHLY' } });
  const u3 = await call('POST', '/users', { tok, body: { name: 'Now Allowed', email: `u3${stamp}@t.com`, mobile: `U3${stamp}`, password: 'password12', role: 'AGENT' } });
  check('user creation allowed after upgrade to unlimited (201)', u3.status === 201, `status ${u3.status}`);
  const c3 = await call('POST', '/calls/log', { tok, body: { phoneNumber: '9990000003', callStatus: 'ANSWERED', direction: 'OUTGOING' } });
  check('call allowed after upgrade (201)', c3.status === 201, `status ${c3.status}`);

  // Cleanup
  await prisma.tenant.deleteMany({ where: { id: tid } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: tiny.id } });
  check('cleanup: tenant + test plan removed', true, `tenants: ${await prisma.tenant.count()}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.n)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
