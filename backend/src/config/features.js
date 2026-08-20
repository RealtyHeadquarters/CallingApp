// Plan-level feature catalog. Features are entitlements a plan grants; a tenant's
// effective features = plan.features ± tenant.featureOverrides. Checked via
// requireFeature() middleware — never hardcoded per controller.
export const FEATURE_KEYS = [
  'CRM',              // leads / contacts
  'CALLING',          // core calling + logging
  'CALL_RECORDING',
  'CAMPAIGNS',
  'ADVANCED_REPORTS', // analytics + performance reports
  'EXPORT',           // data export (xlsx/pdf)
  'BULK_IMPORT',      // CSV lead import
  'API_ACCESS',
];

export const FEATURE_LABELS = {
  CRM: 'CRM / Leads',
  CALLING: 'Calling',
  CALL_RECORDING: 'Call Recording',
  CAMPAIGNS: 'Campaigns',
  ADVANCED_REPORTS: 'Advanced Reports & Analytics',
  EXPORT: 'Data Export',
  BULK_IMPORT: 'Bulk Lead Import',
  API_ACCESS: 'API Access',
};

// Sensible defaults per plan code (used by the seed + as a starting point in the UI).
export const DEFAULT_PLAN_FEATURES = {
  STARTER: ['CRM', 'CALLING', 'EXPORT'],
  BUSINESS: ['CRM', 'CALLING', 'CALL_RECORDING', 'ADVANCED_REPORTS', 'EXPORT', 'BULK_IMPORT'],
  ENTERPRISE: [...FEATURE_KEYS],
  CUSTOM: [],
};
