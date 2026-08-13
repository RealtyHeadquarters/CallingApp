import { serialize } from './repo.js';
import { paginated } from './framework.js';

// Generic paginated list. Firestore can't do substring search, so when a `search`
// term is present we fetch the scoped set (capped) and filter/paginate in memory.
// Without search we use efficient count + offset/limit queries.
export async function listDocs({
  baseQuery,          // (collectionRef) => Query with structured filters, no order/limit
  collectionRef,
  orderByField = 'createdAt',
  orderDir = 'desc',
  page,
  pageSize,
  offset,
  search,
  searchFields = [],
  cap = 2000,
}) {
  const scoped = baseQuery ? baseQuery(collectionRef) : collectionRef;

  if (search) {
    const snap = await scoped.limit(cap).get();
    let rows = snap.docs.map(serialize);
    const term = search.toLowerCase();
    rows = rows.filter((r) => searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(term)));
    rows.sort((a, b) => String(b[orderByField] ?? '').localeCompare(String(a[orderByField] ?? '')));
    const total = rows.length;
    const pageRows = rows.slice(offset, offset + pageSize);
    return paginated(pageRows, total, { page, pageSize });
  }

  const [countSnap, pageSnap] = await Promise.all([
    scoped.count().get(),
    scoped.orderBy(orderByField, orderDir).offset(offset).limit(pageSize).get(),
  ]);
  return paginated(pageSnap.docs.map(serialize), countSnap.data().count, { page, pageSize });
}
