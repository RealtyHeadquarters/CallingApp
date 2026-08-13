import { Router } from 'express';
import { handleTelephonyWebhook } from './webhooks.controller.js';

const router = Router();

// Public endpoint — authenticated via HMAC signature, not JWT (spec §49).
router.post('/telephony', handleTelephonyWebhook);

export default router;
