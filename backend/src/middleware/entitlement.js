import { ApiError } from '../utils/apiError.js';

// Gate a route on a plan FEATURE. req.features is populated by the auth middleware.
export const requireFeature = (feature) => (req, _res, next) => {
  if (req.user?.role === 'SUPER_ADMIN') return next();
  if (req.features?.includes(feature)) return next();
  return next(new ApiError(403, `Your plan does not include this feature (${feature}). Please upgrade.`, { code: 'FEATURE_NOT_IN_PLAN', feature }));
};

// Gate a route on a granular PERMISSION. req.permissions is populated by auth.
export const requirePermission = (permission) => (req, _res, next) => {
  if (req.user?.role === 'SUPER_ADMIN') return next();
  if (req.permissions?.includes(permission)) return next();
  return next(ApiError.forbidden('You do not have permission to perform this action'));
};
