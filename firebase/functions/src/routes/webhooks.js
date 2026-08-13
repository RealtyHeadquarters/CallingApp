import crypto from 'node:crypto';
import { Router } from 'express';
import { COL } from '../admin.js';
import { findOne, update, ts } from '../lib/repo.js';
import { ApiError, asyncHandler } from '../lib/framework.js';

const router = Router();
const SECRET = process.env.TELEPHONY_WEBHOOK_SECRET || '';

const EVENT_TO_STATUS = {
  call_completed: 'ANSWERED', call_no_answer: 'NO_ANSWER', call_busy: 'BUSY',
  call_rejected: 'REJECTED', call_failed: 'FAILED',
};

function verify(req) {
  if (!SECRET) return true; // not configured (dev)
  const sig = req.headers['x-webhook-signature'];
  if (!sig || !req.rawBody) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(req.rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

// Future cloud-provider events reconciled against the Call ID (spec §49).
router.post('/telephony', asyncHandler(async (req, res) => {
  if (!verify(req)) throw ApiError.unauthorized('Invalid webhook signature');
  const { event, call_id: callId, duration_seconds, answer_time, end_time, recording_url } = req.body || {};
  if (!event || !callId) throw ApiError.badRequest('Missing event or call_id');

  const call = await findOne(COL.calls, (c) => c.where('callId', '==', callId));
  if (!call) return res.json({ received: true, matched: false });

  const data = {};
  if (EVENT_TO_STATUS[event]) data.callStatus = EVENT_TO_STATUS[event];
  if (answer_time) data.callAnswerTime = ts(answer_time);
  if (end_time) data.callEndTime = ts(end_time);
  if (typeof duration_seconds === 'number') data.durationSeconds = duration_seconds;
  if (recording_url) data.recordingUrl = recording_url;
  if (Object.keys(data).length) await update(COL.calls, call.id, data);

  if (['call_completed', 'call_no_answer', 'call_busy', 'call_rejected', 'call_failed'].includes(event)) {
    await update(COL.users, call.userId, { agentStatus: 'AVAILABLE' });
  }
  res.json({ received: true, matched: true });
}));

export default router;
