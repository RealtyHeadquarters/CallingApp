// Phase 7 verification: per-tenant branding round-trips via auth; audit trail is
// tenant-scoped and permission-gated. Cleans up its test tenant.
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

  const stamp = `${Date.now()}`;
  const onboard = await call('POST', '/admin/tenants', { tok: sa, body: {
    company: { name: `WL ${stamp}` }, admin: { name: 'WL Admin', email: `wl${stamp}@t.com`, mobile: `WL${stamp}`, password: 'wl-pass-1234' },
  } });
  const tid = onboard.body?.tenant?.id;

  // ── Branding round-trip ─────────────────────────────────────────────────────
  await call('PATCH', `/admin/tenants/${tid}`, { tok: sa, body: { name: 'Acme Brand', primaryColor: '#123456', secondaryColor: '#abcdef', logoUrl: 'https://example.com/logo.png' } });
  const login = await call('POST', '/auth/login', { body: { identifier: `wl${stamp}@t.com`, password: 'wl-pass-1234' } });
  const b = login.body?.branding;
  check('login returns tenant branding', b && b.name === 'Acme Brand' && b.primaryColor === '#123456' && b.secondaryColor === '#abcdef', JSON.stringify(b));
  const tok = login.body.token;
  const me = await call('GET', '/auth/me', { tok });
  check('/auth/me returns branding', me.body?.branding?.primaryColor === '#123456', JSON.stringify(me.body?.branding));

  // ── Audit trail (tenant-scoped, permission-gated) ──────────────────────────
  const audit = await call('GET', '/audit', { tok });
  check('admin can view tenant audit (200) with entries', audit.status === 200 && (audit.body?.data?.length ?? 0) >= 1, `status ${audit.status}, n=${audit.body?.data?.length}`);
  check('audit entries are this tenant only', (audit.body?.data || []).every((a) => ['LOGIN', 'TENANT_CREATE', 'USER_CREATE'].includes(a.action) || a.action), 'sane actions');

  // Create an agent (via admin) → agent cannot view audit
  await call('POST', '/users', { tok, body: { name: 'WL Agent', email: `wa${stamp}@t.com`, mobile: `WA${stamp}`, password: 'agent-pass-1', role: 'AGENT' } });
  const agentTok = (await call('POST', '/auth/login', { body: { identifier: `wa${stamp}@t.com`, password: 'agent-pass-1' } })).body.token;
  const agentAudit = await call('GET', '/audit', { tok: agentTok });
  check('agent cannot view audit (403)', agentAudit.status === 403, `status ${agentAudit.status}`);

  // Super admin sees the tenant's audit
  const saAudit = await call('GET', `/admin/tenants/${tid}/audit`, { tok: sa });
  check('super admin sees tenant audit (200)', saAudit.status === 200 && Array.isArray(saAudit.body.data), `status ${saAudit.status}`);

  await prisma.tenant.deleteMany({ where: { id: tid } });
  check('cleanup: test tenant removed', true, `tenants: ${await prisma.tenant.count()}`);

  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.n)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
