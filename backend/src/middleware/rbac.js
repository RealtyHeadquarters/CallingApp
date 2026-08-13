import { ApiError } from '../utils/apiError.js';

// Restrict a route to one or more roles (spec §3 — role-based permissions).
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have permission to perform this action'));
  }
  next();
};

export const isAdmin = (user) => user?.role === 'ADMIN';
export const isManager = (user) => user?.role === 'MANAGER';
export const isAgent = (user) => user?.role === 'AGENT';
