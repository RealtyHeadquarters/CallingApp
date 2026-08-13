// Seeds a demo organization. These are REAL database rows — all dashboard/report
// numbers are computed from them, nothing is hardcoded. Safe to re-run (idempotent
// on the fixed users/leads by unique email/mobile).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function counterNext(key, tx) {
  const row = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}

async function main() {
  const password = await bcrypt.hash('Password@123', 10);

  const team = await prisma.team.upsert({
    where: { id: 'seed-team-a' },
    update: {},
    create: { id: 'seed-team-a', name: 'Team A', status: 'ACTIVE' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@callingapp.local' },
    update: {},
    create: { name: 'System Admin', email: 'admin@callingapp.local', mobile: '9000000001', passwordHash: password, role: 'ADMIN' },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@callingapp.local' },
    update: { teamId: team.id },
    create: { name: 'Team Manager', email: 'manager@callingapp.local', mobile: '9000000002', passwordHash: password, role: 'MANAGER', teamId: team.id },
  });

  await prisma.team.update({ where: { id: team.id }, data: { managerId: manager.id } });

  const agents = [];
  for (const [i, name] of ['Amit Kumar', 'Rahul Verma', 'Raj Singh'].entries()) {
    const agent = await prisma.user.upsert({
      where: { email: `agent${i + 1}@callingapp.local` },
      update: { teamId: team.id },
      create: {
        name,
        email: `agent${i + 1}@callingapp.local`,
        mobile: `900000001${i}`,
        passwordHash: password,
        role: 'AGENT',
        teamId: team.id,
        agentStatus: 'AVAILABLE',
        dailyCallTarget: 100,
        dailyTalktimeTarget: 3 * 3600,
      },
    });
    agents.push(agent);
  }

  // Demo leads
  const leadSeeds = [
    { name: 'Rahul Sharma', mobile: '9876543210', company: 'Acme Corp', source: 'Website', leadStatus: 'INTERESTED' },
    { name: 'Neha Gupta', mobile: '9876543211', company: 'Globex', source: 'Referral', leadStatus: 'NEW' },
    { name: 'Arjun Kapoor', mobile: '9876543212', company: 'Initech', source: 'Ads', leadStatus: 'CONTACTED' },
    { name: 'Priya Nair', mobile: '9876543213', company: 'Umbrella', source: 'Website', leadStatus: 'CONVERTED' },
    { name: 'Vikram Rao', mobile: '9876543214', company: 'Stark Inc', source: 'Cold Call', leadStatus: 'FOLLOW_UP' },
  ];

  const clients = [];
  for (const seed of leadSeeds) {
    const existing = await prisma.client.findUnique({ where: { mobile: seed.mobile } });
    if (existing) { clients.push(existing); continue; }
    const seq = await counterNext('lead', prisma);
    const client = await prisma.client.create({
      data: {
        ...seed,
        leadId: `LEAD-${String(seq).padStart(6, '0')}`,
        assignedUserId: agents[clients.length % agents.length].id,
        teamId: team.id,
      },
    });
    clients.push(client);
  }

  // Demo calls today (only seed if none exist yet) — real rows drive KPIs.
  const existingCalls = await prisma.call.count();
  if (existingCalls === 0) {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const statuses = ['ANSWERED', 'ANSWERED', 'ANSWERED', 'NO_ANSWER', 'BUSY'];
    let seq = 0;
    for (const agent of agents) {
      for (let i = 0; i < 12; i++) {
        seq++;
        const status = statuses[i % statuses.length];
        const answered = status === 'ANSWERED';
        const start = new Date();
        start.setHours(9 + (i % 8), (i * 7) % 60, 0, 0);
        const duration = answered ? 120 + ((i * 37) % 600) : 0;
        const client = clients[(i + agents.indexOf(agent)) % clients.length];
        await prisma.call.create({
          data: {
            callId: `CALL-${day}-${String(seq).padStart(6, '0')}`,
            userId: agent.id,
            clientId: client.id,
            phoneNumber: client.mobile,
            callStatus: status,
            callStartTime: start,
            callAnswerTime: answered ? new Date(start.getTime() + 15000) : null,
            callEndTime: new Date(start.getTime() + (answered ? duration * 1000 + 15000 : 30000)),
            durationSeconds: duration,
            disposition: answered ? 'INTERESTED' : 'NO_RESPONSE',
            remark: answered ? 'Discussed requirements.' : 'No response.',
          },
        });
      }
    }
    await prisma.counter.upsert({ where: { key: `call:${day}` }, create: { key: `call:${day}`, value: seq }, update: { value: seq } });

    // A couple of follow-ups
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 30, 0, 0);
    await prisma.followUp.create({
      data: { clientId: clients[0].id, userId: agents[0].id, followupAt: tomorrow, followupType: 'CALL', note: 'Discuss pricing and arrange site visit.' },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete.\n  Admin:    admin@callingapp.local / Password@123\n  Manager:  manager@callingapp.local / Password@123\n  Agents:   agent1..3@callingapp.local / Password@123');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
