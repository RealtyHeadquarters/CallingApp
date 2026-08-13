import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

// Maps provider event names -> our CallStatus (spec §49).
const EVENT_TO_STATUS = {
  call_answered: null, // "answered" is set on completion, not on the answer event
  call_completed: 'ANSWERED',
  call_no_answer: 'NO_ANSWER',
  call_busy: 'BUSY',
  call_rejected: 'REJECTED',
  call_failed: 'FAILED',
};

// Verify HMAC-SHA256 signature over the raw body (spec §47 secure webhook validation).
export function verifyWebhookSignature(req) {
  if (!env.telephonyWebhookSecret) return true; // not configured (e.g. dev) — skip
  const signature = req.headers['x-webhook-signature'];
  if (!signature || !req.rawBody) return false;
  const expected = crypto
    .createHmac('sha256', env.telephonyWebhookSecret)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Receives provider call events and reconciles them against the Call ID.
export const handleTelephonyWebhook = asyncHandler(async (req, res) => {
  if (!verifyWebhookSignature(req)) throw ApiError.unauthorized('Invalid webhook signature');

  const { event, call_id: callId, duration_seconds, answer_time, end_time, recording_url } = req.body || {};
  if (!event || !callId) throw ApiError.badRequest('Missing event or call_id');

  const call = await prisma.call.findUnique({ where: { callId }, select: { id: true, userId: true } });
  if (!call) {
    // Acknowledge unknown IDs so the provider does not retry forever.
    return res.json({ received: true, matched: false });
  }

  const data = {};
  if (event in EVENT_TO_STATUS && EVENT_TO_STATUS[event]) data.callStatus = EVENT_TO_STATUS[event];
  if (event === 'call_started') data.callStartTime = new Date();
  if (answer_time) data.callAnswerTime = new Date(answer_time);
  if (end_time) data.callEndTime = new Date(end_time);
  if (typeof duration_seconds === 'number') data.durationSeconds = duration_seconds;
  if (recording_url) data.recordingUrl = recording_url;

  if (Object.keys(data).length > 0) {
    await prisma.call.update({ where: { id: call.id }, data });
  }

  // Terminal events release the agent's presence.
  const terminal = ['call_completed', 'call_no_answer', 'call_busy', 'call_rejected', 'call_failed'];
  if (terminal.includes(event)) {
    await prisma.user.update({ where: { id: call.userId }, data: { agentStatus: 'AVAILABLE' } });
  }

  res.json({ received: true, matched: true });
});
