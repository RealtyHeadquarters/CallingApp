import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { getMySubscription, listAvailablePlans } from './subscriptions.controller.js';

const router = Router();
router.use(authenticate);

// Reads only — usable even when the subscription is read-only/expired.
router.get('/', getMySubscription);
router.get('/plans', listAvailablePlans);

export default router;
