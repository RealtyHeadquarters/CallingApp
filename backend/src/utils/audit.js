import { prisma } from '../lib/prisma.js';

// Fire-and-forget audit trail (spec §41 AUDIT LOGS). Never blocks the request path.
export function recordAudit(req, { action, entityType, entityId, description }) {
  const userId = req.user?.id || null;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
  prisma.auditLog
    .create({ data: { userId, action, entityType, entityId, description, ipAddress } })
    .catch((e) => {
      // Auditing must not break the main flow.
      // eslint-disable-next-line no-console
      console.error('audit log failed:', e.message);
    });
}
