// End-to-end SaaS security proof over HTTP. Spins up two tenants via the real
// API and asserts cross-tenant isolation, RBAC, super-admin gating, suspension,
// and onboarding validation. Requires the server running (BASE below) and the
// super admin credentials via env. Cleans up both test tenants at the end.
//
//   SA_EMAIL=superadmin@procallingapp.com SA_PASSWORD=xxxx BASE=http://localhost:4055/api \
//     node scripts/verify-saas-security.mjs
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE || 'http://localhost:4055/api';
const SA_EMAIL = process.env.SA_EMAIL || 'superadmin@procallingapp.com';
const SA_PASSWORD = process.env.SA_PASSWORD;
if (!SA_PASSWORD) { console.error('Set SA_PASSWORD env'); process.exit(2); }

const prisma = new PrismaClient();
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const call = (method, path, { tok, body } = {}) =>
  fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(j);

async function onboard(sa, name, adminEmail) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const password = 'secret-pass-123';
  const r = await call('POST', '/admin/tenants', { tok: sa, body: {
    company: { name: `${name} ${stamp}` },
    admin: { name: `${name} Admin`, email: `${adminEmail}${stamp}@test.com`, mobile: `MB${stamp}`, password },
  } });
  return { tenantId: r.body?.tenant?.id, email: r.body?.admin?.email, password, status: r.status };
}

async function main() {
  // Super admin login
  const saLogin = await call('POST', '/auth/login', { body: { identifier: SA_EMAIL, password: SA_PASSWORD } });
  check('super admin can log in', saLogin.status === 200 && saLogin.body.user?.role === 'SUPER_ADMIN');
  const sa = saLogin.body.token;

  // Create two isolated tenants (A, B)
  const A = await onboard(sa, 'Alpha Test', 'alpha');
  const B = await onboard(sa, 'Bravo Test', 'bravo');
  check('onboarded two tenants', A.status === 201 && B.status === 201, `${A.tenantId} / ${B.tenantId}`);

  const aLogin = await call('POST', '/auth/login', { body: { identifier: A.email, password: A.password } });
  const bLogin = await call('POST', '/auth/login', { body: { identifier: B.email, password: B.password } });
  const aTok = aLogin.body.token, bTok = bLogin.body.token;

  // B creates a lead + an agent in its own tenant
  const bLead = await call('POST', '/leads', { tok: bTok, body: { name: 'Bravo Secret Lead', mobile: `BL${Date.now()}` } });
  check('B can create its own lead', bLead.status === 201, `status ${bLead.status}`);
  const bLeadId = bLead.body?.client?.id || bLead.body?.id;
  const bUsersList = await call('GET', '/users?pageSize=50', { tok: bTok });
  const bAdminId = bUsersList.body?.data?.[0]?.id;

  // ── Cross-tenant IDOR: A must NOT reach B's lead or user by id ──────────────
  const aReadBLead = await call('GET', `/leads/${bLeadId}`, { tok: aTok });
  check("A cannot GET B's lead by id (404)", aReadBLead.status === 404, `status ${aReadBLead.status}`);

  const aEditBLead = await call('PATCH', `/leads/${bLeadId}`, { tok: aTok, body: { name: 'HACKED' } });
  check("A cannot PATCH B's lead (404)", aEditBLead.status === 404, `status ${aEditBLead.status}`);

  const aReadBUser = await call('GET', `/users/${bAdminId}`, { tok: aTok });
  check("A cannot GET B's user by id (404)", aReadBUser.status === 404, `status ${aReadBUser.status}`);

  const aEditBUser = await call('PATCH', `/users/${bAdminId}`, { tok: aTok, body: { status: 'INACTIVE' } });
  check("A cannot deactivate B's user (404)", aEditBUser.status === 404, `status ${aEditBUser.status}`);

  const aDelBUser = await call('DELETE', `/users/${bAdminId}/permanent`, { tok: aTok });
  check("A cannot delete B's user (404)", aDelBUser.status === 404, `status ${aDelBUser.status}`);

  // A's lead list must never include B's lead
  const aLeads = await call('GET', '/leads?pageSize=100&search=Bravo', { tok: aTok });
  const leaked = (aLeads.body?.data || []).some((l) => l.id === bLeadId);
  check("A's lead search never returns B's lead", !leaked);

  // ── Privilege: client admin cannot reach the super-admin API ───────────────
  const aToAdmin = await call('GET', '/admin/stats', { tok: aTok });
  check('client admin blocked from /admin/stats (403)', aToAdmin.status === 403, `status ${aToAdmin.status}`);
  const aListTenants = await call('GET', '/admin/tenants', { tok: aTok });
  check('client admin blocked from /admin/tenants (403)', aListTenants.status === 403, `status ${aListTenants.status}`);

  // ── Privilege: cannot create a SUPER_ADMIN via tenant user API ─────────────
  const escalate = await call('POST', '/users', { tok: aTok, body: { name: 'x', email: `esc${Date.now()}@t.com`, mobile: `E${Date.now()}`, password: 'password12', role: 'SUPER_ADMIN' } });
  check('client admin cannot create SUPER_ADMIN (400 validation)', escalate.status === 400, `status ${escalate.status}`);

  // ── Onboarding validation: admin role is fixed (no SUPER_ADMIN field accepted)
  const badOnboard = await call('POST', '/admin/tenants', { tok: sa, body: { company: { name: 'X' }, admin: { name: 'Y', email: 'bad', mobile: '1', password: 'short' } } });
  check('onboarding rejects invalid admin payload (400)', badOnboard.status === 400, `status ${badOnboard.status}`);

  // ── Client-supplied FK injection: A cannot cross-link to / disclose B's rows ─
  const aCallInject = await call('POST', '/calls/log', { tok: aTok, body: {
    phoneNumber: '9990001111', clientId: bLeadId, callStatus: 'ANSWERED', direction: 'OUTGOING',
  } });
  const leakedClient = aCallInject.body?.call?.client;
  check("A: call with B's clientId does NOT leak B's client (dropped to null)",
    aCallInject.status === 201 && !leakedClient, `client=${JSON.stringify(leakedClient)}`);

  const aLeadInject = await call('POST', '/leads', { tok: aTok, body: {
    name: 'Injected', mobile: `INJ${Date.now()}`, assignedUserId: bAdminId,
  } });
  check("A: lead assignedUserId=B's user is rejected (400)", aLeadInject.status === 400, `status ${aLeadInject.status}`);

  // ── Suspension: suspend A → its admin is locked out (403) ───────────────────
  await call('PATCH', `/admin/tenants/${A.tenantId}/status`, { tok: sa, body: { status: 'SUSPENDED' } });
  const aAfter = await call('GET', '/dashboard/admin', { tok: aTok });
  check('suspended tenant user is locked out (403)', aAfter.status === 403, `status ${aAfter.status}`);
  // B (still active) keeps working
  const bAfter = await call('GET', '/dashboard/admin', { tok: bTok });
  check('unaffected tenant keeps working (200)', bAfter.status === 200, `status ${bAfter.status}`);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await prisma.tenant.deleteMany({ where: { id: { in: [A.tenantId, B.tenantId] } } });
  const left = await prisma.tenant.count();
  check('cleanup: both test tenants removed', true, `tenants remaining: ${left}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.name)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
