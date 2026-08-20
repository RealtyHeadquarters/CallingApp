// Granular permission catalog + default role→permission map. Centralised here so
// permissions are never hardcoded across controllers — routes use requirePermission().
// (Per-tenant custom roles can layer on top of these defaults in a later phase.)
export const PERMISSIONS = [
  'lead.view', 'lead.create', 'lead.edit', 'lead.delete', 'lead.assign', 'lead.export', 'lead.import',
  'call.view', 'call.log', 'call.manual',
  'report.view', 'report.export',
  'user.view', 'user.create', 'user.edit', 'user.delete',
  'team.view', 'team.manage',
  'followup.view', 'followup.manage',
  'audit.view',
];

const ALL = [...PERMISSIONS];

// These defaults reproduce the existing role gating exactly (no behaviour change),
// while making the model explicit and customisable.
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ALL, // platform owner (bypasses the tenant app anyway)
  ADMIN: ALL,
  MANAGER: [
    'lead.view', 'lead.create', 'lead.edit', 'lead.assign', 'lead.export', 'lead.import',
    'call.view', 'call.log', 'call.manual',
    'report.view', 'report.export',
    'user.view', 'team.view',
    'followup.view', 'followup.manage',
  ],
  AGENT: [
    'lead.view', 'lead.edit',
    'call.view', 'call.log',
    'followup.view', 'followup.manage',
  ],
};

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}
