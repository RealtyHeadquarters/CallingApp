import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  listNotifications, listQuery, unreadCount, markRead, markAllRead,
} from './notifications.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', validate(listQuery, 'query'), listNotifications);
router.get('/unread-count', unreadCount);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);

export default router;
