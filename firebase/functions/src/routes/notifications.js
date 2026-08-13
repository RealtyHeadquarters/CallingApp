import { Router } from 'express';
import { z } from 'zod';
import { db, COL } from '../admin.js';
import { getById, update } from '../lib/repo.js';
import { listDocs } from '../lib/list.js';
import { ApiError, asyncHandler, validate, parsePagination } from '../lib/framework.js';
import { authenticate } from '../auth.js';

const router = Router();
router.use(authenticate);

router.get('/', validate(z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  unreadOnly: z.coerce.boolean().optional(),
}), 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const { page, pageSize, offset } = parsePagination(q, { defaultSize: 20 });
  const result = await listDocs({
    collectionRef: db.collection(COL.notifications),
    baseQuery: (c) => {
      let query = c.where('userId', '==', req.user.id);
      if (q.unreadOnly) query = query.where('read', '==', false);
      return query;
    },
    page, pageSize, offset,
  });
  const unread = await db.collection(COL.notifications).where('userId', '==', req.user.id).where('read', '==', false).count().get();
  res.json({ ...result, unreadCount: unread.data().count });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const snap = await db.collection(COL.notifications).where('userId', '==', req.user.id).where('read', '==', false).count().get();
  res.json({ unreadCount: snap.data().count });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const snap = await db.collection(COL.notifications).where('userId', '==', req.user.id).where('read', '==', false).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
  res.json({ success: true });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const n = await getById(COL.notifications, req.params.id);
  if (!n || n.userId !== req.user.id) throw ApiError.notFound('Notification not found');
  await update(COL.notifications, req.params.id, { read: true });
  res.json({ success: true });
}));

export default router;
