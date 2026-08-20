// Security verification for Phase 1 tenant isolation.
// Creates a throwaway Tenant B, then proves a Tenant-A context cannot read,
// update, or delete Tenant-B rows — even by primary-key id. Cleans up after.
import { prisma } from '../src/lib/prisma.js';
import { runAsTenant, runUnscoped } from '../src/lib/tenantContext.js';

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  const A = await prisma.tenant.findUnique({ where: { slug: 'primary' } });
  if (!A) throw new Error('primary tenant missing');

  // Throwaway Tenant B (clearly marked, cleaned up at the end).
  const B = await prisma.tenant.upsert({
    where: { slug: '__isolation_test__' },
    update: {},
    create: { name: 'Isolation Test Co', slug: '__isolation_test__', status: 'ACTIVE' },
  });

  const stamp = Date.now();
  // Create a lead INSIDE Tenant B's context — extension must tag it tenantId=B.
  const bLead = await runAsTenant(B.id, async () =>
    await prisma.client.create({
      data: { leadId: `ITEST-${stamp}`, name: 'B Secret Lead', mobile: `IT${stamp}` },
      select: { id: true, tenantId: true, name: true },
    })
  );
  check('create inside Tenant B is auto-tagged tenantId=B', bLead.tenantId === B.id, `got ${bLead.tenantId}`);

  // ── From Tenant A's context, try to reach B's lead every which way ──────────
  await runAsTenant(A.id, async () => {
    const byId = await prisma.client.findUnique({ where: { id: bLead.id } });
    check("A: findUnique(B.leadId) returns null", byId === null);

    const byFirst = await prisma.client.findFirst({ where: { id: bLead.id } });
    check('A: findFirst(B.leadId) returns null', byFirst === null);

    const inList = await prisma.client.findMany({ where: { name: 'B Secret Lead' } });
    check("A: findMany never lists B's lead", inList.length === 0, `found ${inList.length}`);

    let updateEscaped = false;
    try {
      await prisma.client.update({ where: { id: bLead.id }, data: { name: 'HACKED' } });
      updateEscaped = true;
    } catch { /* P2025 expected */ }
    check('A: update(B.leadId) is blocked', !updateEscaped);

    let deleteEscaped = false;
    try {
      await prisma.client.delete({ where: { id: bLead.id } });
      deleteEscaped = true;
    } catch { /* P2025 expected */ }
    check('A: delete(B.leadId) is blocked', !deleteEscaped);

    const updMany = await prisma.client.updateMany({ where: { id: bLead.id }, data: { name: 'HACKED' } });
    check('A: updateMany(B.leadId) affects 0 rows', updMany.count === 0, `count=${updMany.count}`);

    const aCount = await prisma.client.count();
    check("A: count() sees only A's leads (not B's)", aCount >= 550, `A leads=${aCount}`);
  });

  // ── Confirm B still sees its own lead (not broken) ──────────────────────────
  await runAsTenant(B.id, async () => {
    const mine = await prisma.client.findUnique({ where: { id: bLead.id } });
    check('B: can read its own lead', mine !== null && mine.name === 'B Secret Lead');
    const bCount = await prisma.client.count();
    check('B: count() sees only its 1 lead', bCount === 1, `B leads=${bCount}`);
  });

  // ── Verify the B lead was never mutated by A's attempts ─────────────────────
  const finalB = await runUnscoped(() => prisma.client.findUnique({ where: { id: bLead.id } }));
  check('B lead name untouched by A', finalB?.name === 'B Secret Lead', `name=${finalB?.name}`);

  // ── Cleanup: delete Tenant B (cascade removes its rows) ─────────────────────
  await runUnscoped(() => prisma.tenant.delete({ where: { id: B.id } }));
  const gone = await runUnscoped(() => prisma.client.findUnique({ where: { id: bLead.id } }));
  check('cleanup: Tenant B + its lead removed', gone === null);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.name)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
