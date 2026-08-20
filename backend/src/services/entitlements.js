import { FEATURE_KEYS } from '../config/features.js';
import { permissionsForRole } from '../config/permissions.js';

// Effective features for a tenant.
//   plan present → its features (even if empty)
//   no plan (e.g. a trial not yet on a plan) → ALL features, so evaluation is unrestricted
// then apply per-tenant overrides ({ featureKey: true|false }).
export function computeFeatures(plan, featureOverrides) {
  const base = plan ? (plan.features || []) : FEATURE_KEYS;
  const set = new Set(base);
  if (featureOverrides && typeof featureOverrides === 'object') {
    for (const [key, on] of Object.entries(featureOverrides)) {
      if (on === true) set.add(key);
      else if (on === false) set.delete(key);
    }
  }
  return [...set];
}

export function computePermissions(role) {
  return permissionsForRole(role);
}
