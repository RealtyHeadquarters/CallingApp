import { db, COL } from '../admin.js';

// Atomically increment a named counter in a transaction and return the new value.
async function nextCounter(key) {
  const ref = db.collection(COL.counters).doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const value = (snap.exists ? snap.data().value : 0) + 1;
    tx.set(ref, { value }, { merge: true });
    return value;
  });
}

function yyyymmdd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// CALL-YYYYMMDD-000001 (spec §40)
export async function generateCallId(date = new Date()) {
  const day = yyyymmdd(date);
  const seq = await nextCounter(`call:${day}`);
  return `CALL-${day}-${String(seq).padStart(6, '0')}`;
}

// LEAD-000123
export async function generateLeadId() {
  const seq = await nextCounter('lead');
  return `LEAD-${String(seq).padStart(6, '0')}`;
}
