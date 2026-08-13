import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { createApp } from './src/app.js';
import { runReminderTick } from './src/scheduler.js';

// Production secrets — set with `firebase functions:secrets:set <NAME>`.
// In the emulator these are unset and the code falls back to dev defaults.
const JWT_SECRET = defineSecret('JWT_SECRET');
const TELEPHONY_WEBHOOK_SECRET = defineSecret('TELEPHONY_WEBHOOK_SECRET');
const SETUP_KEY = defineSecret('SETUP_KEY');

// Entire REST API served by one HTTPS function. Clients call:
//   https://<region>-<project>.cloudfunctions.net/api/<path>
export const api = onRequest(
  { region: 'us-central1', cors: true, secrets: [JWT_SECRET, TELEPHONY_WEBHOOK_SECRET, SETUP_KEY] },
  createApp()
);

// Background reminders / overdue / daily summary (spec §33/§45).
export const reminders = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1' },
  async () => {
    await runReminderTick();
  }
);
