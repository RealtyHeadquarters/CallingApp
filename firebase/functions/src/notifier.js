import { create } from './lib/repo.js';
import { COL } from './admin.js';

// Create an in-app notification (spec §45).
export async function notify({ userId, type, title, body, entityType, entityId }) {
  if (!userId) return null;
  return create(COL.notifications, {
    userId, type, title, body: body || null,
    entityType: entityType || null, entityId: entityId || null,
    read: false,
  });
}
