import { Router } from 'express';
import { handleTelephonyWebhook } from './webhooks.controller.js';
import { razorpayWebhook } from '../billing/billing.controller.js';

const router = Router();

// Public endpoints — authenticated via HMAC signature, not JWT (spec §49).
router.post('/telephony', handleTelephonyWebhook);
router.post('/razorpay', razorpayWebhook);

export default router;
