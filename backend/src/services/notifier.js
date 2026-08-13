import { prisma } from '../lib/prisma.js';

// Create an in-app notification. Central place so a push channel (FCM) can be
// added later without touching call sites (spec §45).
export async function notify({ userId, type, title, body, entityType, entityId }, tx = prisma) {
  if (!userId) return null;
  return tx.notification.create({
    data: { userId, type, title, body, entityType, entityId },
  });
}
