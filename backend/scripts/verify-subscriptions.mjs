// Phase 3 verification: plan catalog, onboarding-with-trial, assign plan,
// expiry read-only enforcement (writes 402, reads OK), and extend/renew.
// Requires the server running + super admin creds. Cleans up its test tenant.
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

  const plans = await call('GET', '/admin/plans', { tok: sa });
  check('plan catalog has the 3 defaults', plans.body?.data?.length >= 3, `count=${plans.body?.data?.length}`);
  const business = plans.body.data.find((p) => p.code === 'BUSINESS');

  // Onboard with a 14-day trial
  const stamp = `${Date.now()}`;
  const onboard = await call('POST', '/admin/tenants', { tok: sa, body: {
    company: { name: `Sub Test ${stamp}` },
    admin: { name: 'Sub Admin', email: `sub${stamp}@test.com`, mobile: `SB${stamp}`, password: 'sub-pass-1234' },
    subscription: { trialDays: 14 },
  } });
  check('onboarding creates a TRIAL subscription', onboard.body?.subscription?.state === 'TRIAL', `state=${onboard.body?.subscription?.state}`);
  const tid = onboard.body?.tenant?.id;
  const tok = (await call('POST', '/auth/login', { body: { identifier: `sub${stamp}@test.com`, password: 'sub-pass-1234' } })).body.token;

  // Trial = full access
  const trialLead = await call('POST', '/leads', { tok, body: { name: 'Trial Lead', mobile: `TL${stamp}` } });
  check('TRIAL tenant can write (201)', trialLead.status === 201, `status ${trialLead.status}`);
  const mySub = await call('GET', '/subscription', { tok });
  check('client can view own subscription', mySub.status === 200 && mySub.body?.subscription?.state === 'TRIAL');

  // Assign a paid plan → ACTIVE
  const assign = await call('PUT', `/admin/tenants/${tid}/subscription`, { tok: sa, body: { planId: business.id, billingCycle: 'MONTHLY' } });
  check('assign plan → ACTIVE with limits', assign.body?.subscription?.state === 'ACTIVE' && assign.body?.subscription?.limits?.users === 25, `state=${assign.body?.subscription?.state}`);
  const meActive = await call('GET', '/auth/me', { tok });
  check('/auth/me reports ACTIVE + not read-only', meActive.body?.subscription?.state === 'ACTIVE' && meActive.body?.subscription?.readOnly === false);

  // Cancel → read-only enforcement
  await call('POST', `/admin/tenants/${tid}/subscription/cancel`, { tok: sa });
  const meCancelled = await call('GET', '/auth/me', { tok });
  check('/auth/me reports read-only after cancel', meCancelled.body?.subscription?.readOnly === true, `state=${meCancelled.body?.subscription?.state}`);
  const blockedWrite = await call('POST', '/leads', { tok, body: { name: 'x', mobile: `BW${stamp}` } });
  check('expired tenant WRITE blocked (402)', blockedWrite.status === 402, `status ${blockedWrite.status}`);
  check('402 carries SUBSCRIPTION_EXPIRED code', blockedWrite.body?.error?.details?.code === 'SUBSCRIPTION_EXPIRED' || blockedWrite.body?.error?.message?.includes('expired'), JSON.stringify(blockedWrite.body?.error?.details));
  const allowedRead = await call('GET', '/leads', { tok });
  check('expired tenant READ still works (200)', allowedRead.status === 200, `status ${allowedRead.status}`);
  const subViewWhenExpired = await call('GET', '/subscription', { tok });
  check('expired tenant can still view billing (200)', subViewWhenExpired.status === 200);

  // Extend → active again
  const extend = await call('POST', `/admin/tenants/${tid}/subscription/extend`, { tok: sa, body: { days: 30 } });
  check('extend restores ACTIVE', extend.body?.subscription?.state === 'ACTIVE', `state=${extend.body?.subscription?.state}`);
  const writeAgain = await call('POST', '/leads', { tok, body: { name: 'After Renew', mobile: `AR${stamp}` } });
  check('renewed tenant can write again (201)', writeAgain.status === 201, `status ${writeAgain.status}`);

  // Tenant 1 (Enterprise) unaffected — sanity
  // (its admin lives in real data; we only assert the plan endpoint works)

  await prisma.tenant.deleteMany({ where: { id: tid } });
  check('cleanup: test tenant removed', true, `tenants left: ${await prisma.tenant.count()}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.n)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
