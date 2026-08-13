// Small framework helpers shared across modules (mirrors the Node backend).

export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
  static badRequest(m = 'Bad request', d) { return new ApiError(400, m, d); }
  static unauthorized(m = 'Unauthorized') { return new ApiError(401, m); }
  static forbidden(m = 'Forbidden') { return new ApiError(403, m); }
  static notFound(m = 'Not found') { return new ApiError(404, m); }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(ApiError.badRequest('Validation failed', details));
  }
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  next();
};

export function parsePagination(query, { defaultSize = 25, maxSize = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginated(data, total, { page, pageSize }) {
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 } };
}
