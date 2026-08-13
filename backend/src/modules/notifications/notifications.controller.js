import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination, paginated } from '../../utils/pagination.js';

export const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const listNotifications = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, skip, take } = parsePagination(q, { defaultSize: 20 });
  const where = { userId: req.user.id };
  if (q.unreadOnly) where.read = false;

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, read: false } }),
  ]);
  res.json({ ...paginated(rows, total, { page, pageSize }), unreadCount });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user.id, read: false } });
  res.json({ unreadCount: count });
});

export const markRead = asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { read: true },
  });
  if (result.count === 0) throw ApiError.notFound('Notification not found');
  res.json({ success: true });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });
  res.json({ success: true });
});
