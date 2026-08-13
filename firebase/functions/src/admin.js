import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// Initialize once (safe under the emulator and in prod). When running against the
// emulator, FIRESTORE_EMULATOR_HOST is set automatically by the Firebase CLI.
if (getApps().length === 0) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'callingapp-dev' });
}

export const db = getFirestore();
export { FieldValue, Timestamp };

// Collection name constants — the Firestore equivalent of our tables.
export const COL = {
  users: 'users',
  teams: 'teams',
  clients: 'clients',
  calls: 'calls',
  followUps: 'followUps',
  notifications: 'notifications',
  auditLogs: 'auditLogs',
  counters: 'counters',
  resetTokens: 'passwordResetTokens',
};
