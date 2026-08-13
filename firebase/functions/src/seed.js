// Seeds a demo organization into Firestore. Run against the emulator:
//   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=callingapp-dev node src/seed.js
import bcrypt from 'bcryptjs';
import { db, COL, Timestamp } from './admin.js';

async function main() {
  const password = await bcrypt.hash('Password@123', 10);
  const now = Timestamp.now();
  const base = { createdAt: now, updatedAt: now };

  // Team
  await db.collection(COL.teams).doc('team-a').set({ ...base, name: 'Team A', status: 'ACTIVE', managerId: 'user-manager' });

  // Users
  const users = [
    { id: 'user-admin', name: 'System Admin', email: 'admin@callingapp.local', mobile: '9000000001', role: 'ADMIN', teamId: null },
    { id: 'user-manager', name: 'Team Manager', email: 'manager@callingapp.local', mobile: '9000000002', role: 'MANAGER', teamId: 'team-a' },
    { id: 'user-agent1', name: 'Amit Kumar', email: 'agent1@callingapp.local', mobile: '9000000011', role: 'AGENT', teamId: 'team-a' },
    { id: 'user-agent2', name: 'Rahul Verma', email: 'agent2@callingapp.local', mobile: '9000000012', role: 'AGENT', teamId: 'team-a' },
    { id: 'user-agent3', name: 'Raj Singh', email: 'agent3@callingapp.local', mobile: '9000000013', role: 'AGENT', teamId: 'team-a' },
  ];
  for (const u of users) {
    await db.collection(COL.users).doc(u.id).set({
      ...base, ...u, passwordHash: password, status: 'ACTIVE', agentStatus: 'AVAILABLE',
      dailyCallTarget: u.role === 'AGENT' ? 100 : null,
      dailyTalktimeTarget: u.role === 'AGENT' ? 3 * 3600 : null,
    });
  }
  const agents = users.filter((u) => u.role === 'AGENT');

  // Leads
  const leadSeeds = [
    { name: 'Rahul Sharma', mobile: '9876543210', company: 'Acme Corp', source: 'Website', leadStatus: 'INTERESTED' },
    { name: 'Neha Gupta', mobile: '9876543211', company: 'Globex', source: 'Referral', leadStatus: 'NEW' },
    { name: 'Arjun Kapoor', mobile: '9876543212', company: 'Initech', source: 'Ads', leadStatus: 'CONTACTED' },
    { name: 'Priya Nair', mobile: '9876543213', company: 'Umbrella', source: 'Website', leadStatus: 'CONVERTED' },
    { name: 'Vikram Rao', mobile: '9876543214', company: 'Stark Inc', source: 'Cold Call', leadStatus: 'FOLLOW_UP' },
  ];
  const clients = [];
  for (let i = 0; i < leadSeeds.length; i++) {
    const s = leadSeeds[i];
    const id = `lead-${i + 1}`;
    const agent = agents[i % agents.length];
    await db.collection(COL.clients).doc(id).set({
      ...base, ...s, leadId: `LEAD-${String(i + 1).padStart(6, '0')}`,
      alternateMobile: null, email: null, assignedUserId: agent.id, teamId: 'team-a',
    });
    clients.push({ id, ...s, assignedUserId: agent.id });
  }
  await db.collection(COL.counters).doc('lead').set({ value: leadSeeds.length });

  // Calls (real docs -> KPIs computed from them)
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const statuses = ['ANSWERED', 'ANSWERED', 'ANSWERED', 'NO_ANSWER', 'BUSY'];
  let seq = 0;
  for (const agent of agents) {
    for (let i = 0; i < 12; i++) {
      seq++;
      const status = statuses[i % statuses.length];
      const answered = status === 'ANSWERED';
      const start = new Date(); start.setHours(9 + (i % 8), (i * 7) % 60, 0, 0);
      const duration = answered ? 120 + ((i * 37) % 600) : 0;
      const client = clients[(i + agents.indexOf(agent)) % clients.length];
      await db.collection(COL.calls).doc(`call-${seq}`).set({
        ...base,
        callId: `CALL-${day}-${String(seq).padStart(6, '0')}`,
        userId: agent.id, userName: agent.name,
        clientId: client.id, clientName: client.name, clientLeadStatus: client.leadStatus,
        phoneNumber: client.mobile, callStatus: status,
        callStartTime: Timestamp.fromDate(start),
        callAnswerTime: answered ? Timestamp.fromDate(new Date(start.getTime() + 15000)) : null,
        callEndTime: Timestamp.fromDate(new Date(start.getTime() + (answered ? duration * 1000 + 15000 : 30000))),
        durationSeconds: duration, disposition: answered ? 'INTERESTED' : 'NO_RESPONSE',
        remark: answered ? 'Discussed requirements.' : 'No response.', recordingUrl: null,
      });
    }
  }
  await db.collection(COL.counters).doc(`call:${day}`).set({ value: seq });

  // A follow-up
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(11, 30, 0, 0);
  await db.collection(COL.followUps).doc('fu-1').set({
    ...base, clientId: clients[0].id, callId: null, userId: agents[0].id,
    followupAt: Timestamp.fromDate(t), followupType: 'CALL', note: 'Discuss pricing.',
    status: 'PENDING', reminderSent: false, overdueNotified: false,
  });

  // eslint-disable-next-line no-console
  console.log('Firestore seed complete. Logins: admin@callingapp.local / Password@123 (also manager@, agent1..3@).');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
