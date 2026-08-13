import { ApiError } from '../utils/apiError.js';

// Validate req[source] against a Zod schema, replacing it with the parsed value.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return next(ApiError.badRequest('Validation failed', details));
  }
  // req.query is a getter-only in newer Express; assign to a stable property.
  if (source === 'query') {
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  next();
};
