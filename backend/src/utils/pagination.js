// Parse ?page & ?pageSize into Prisma skip/take. Server-side pagination (spec §48).
export function parsePagination(query, { defaultSize = 25, maxSize = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated(data, total, { page, pageSize }) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}
