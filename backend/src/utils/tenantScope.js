import { prisma } from '../lib/prisma.js';
import { ApiError } from './apiError.js';

// Tenant-isolation defense for client-supplied foreign keys.
//
// The Prisma tenant extension scopes TOP-LEVEL queries, but it does NOT scope
// nested relation reads, and the DB foreign keys are single-column (no composite
// [tenantId, id]). So a caller could set a FK (clientId, assignedUserId, teamId,
// callId, …) to another tenant's row; the row would persist and later leak that
// tenant's data through an eager-loaded relation.
//
// These helpers re-validate every client-supplied FK against the CURRENT tenant.
// The lookups below are auto-scoped by the extension, so a foreign id resolves to
// null — which we then reject (interactive) or drop (bulk).

// Reject (400) if a provided id does not belong to the caller's tenant.
// Returns the id when valid, or null when not provided.
export async function assertOwnedId(model, id, label = 'record') {
  if (!id) return null;
  const row = await prisma[model].findFirst({ where: { id }, select: { id: true } });
  if (!row) throw ApiError.badRequest(`Selected ${label} does not exist`);
  return row.id;
}

// Silently drop a foreign/invalid id to null (for bulk import / best-effort links).
export async function ownedIdOrNull(model, id) {
  if (!id) return null;
  const row = await prisma[model].findFirst({ where: { id }, select: { id: true } });
  return row ? row.id : null;
}
