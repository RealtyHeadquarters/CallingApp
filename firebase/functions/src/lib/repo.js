import { db, Timestamp } from '../admin.js';

// Convert Firestore Timestamps to ISO strings recursively so API responses match
// the previous (Prisma) JSON shape the clients already consume.
export function serialize(doc) {
  if (!doc) return null;
  const data = doc.data ? doc.data() : doc;
  const out = { id: doc.id ?? data.id };
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

export async function getById(col, id) {
  if (!id) return null;
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? serialize(snap) : null;
}

export async function findOne(col, buildQuery) {
  const q = buildQuery(db.collection(col)).limit(1);
  const snap = await q.get();
  return snap.empty ? null : serialize(snap.docs[0]);
}

export async function findMany(col, buildQuery) {
  const q = buildQuery ? buildQuery(db.collection(col)) : db.collection(col);
  const snap = await q.get();
  return snap.docs.map(serialize);
}

export async function create(col, data, id) {
  const now = Timestamp.now();
  const payload = { createdAt: now, updatedAt: now, ...data };
  if (id) {
    await db.collection(col).doc(id).set(payload);
    return serialize({ id, data: () => payload });
  }
  const ref = await db.collection(col).add(payload);
  const snap = await ref.get();
  return serialize(snap);
}

export async function update(col, id, data) {
  await db.collection(col).doc(id).set({ ...data, updatedAt: Timestamp.now() }, { merge: true });
  return getById(col, id);
}

export async function count(col, buildQuery) {
  const q = buildQuery ? buildQuery(db.collection(col)) : db.collection(col);
  const snap = await q.count().get();
  return snap.data().count;
}

// Convert a JS Date (or ISO string) to a Firestore Timestamp for storage.
export function ts(dateLike) {
  if (!dateLike) return null;
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Timestamp.fromDate(d);
}
