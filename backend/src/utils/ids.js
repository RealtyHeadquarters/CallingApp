import { prisma } from '../lib/prisma.js';

// Atomically bump a named counter and return the new value.
// Uses an upsert so the first call for a key initializes it.
async function nextCounter(key, tx = prisma) {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

function yyyymmdd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// CALL-YYYYMMDD-000001 (spec §40) — per-day sequence.
export async function generateCallId(date = new Date(), tx = prisma) {
  const day = yyyymmdd(date);
  const seq = await nextCounter(`call:${day}`, tx);
  return `CALL-${day}-${String(seq).padStart(6, '0')}`;
}

// LEAD-000123 — global sequence.
export async function generateLeadId(tx = prisma) {
  const seq = await nextCounter('lead', tx);
  return `LEAD-${String(seq).padStart(6, '0')}`;
}
