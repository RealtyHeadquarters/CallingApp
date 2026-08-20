import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination, paginated } from '../../utils/pagination.js';

const auditSelect = {
  id: true, action: true, entityType: true, entityId: true, description: true,
  ipAddress: true, createdAt: true, user: { select: { id: true, name: true } },
};

export const listAuditQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  action: z.string().optional(),
});

// Tenant-scoped audit trail (auto-scoped by the extension).
export const listAudit = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q);
  const where = {};
  if (q.action) where.action = q.action;
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, select: auditSelect, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  res.json(paginated(rows, total, { page, pageSize }));
});
