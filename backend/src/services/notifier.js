import { prisma } from '../lib/prisma.js';

// Create an in-app notification. Central place so a push channel (FCM) can be
// added later without touching call sites (spec §45).
// `tenantId` is optional: inside a request (or runAsTenant) the Prisma extension
// injects it automatically; background scans that run without context pass it
// explicitly so the notification is tagged to the right tenant.
export async function notify({ userId, tenantId, type, title, body, entityType, entityId }, tx = prisma) {
  if (!userId) return null;
  const data = { userId, type, title, body, entityType, entityId };
  if (tenantId !== undefined) data.tenantId = tenantId;
  return tx.notification.create({ data });
}
