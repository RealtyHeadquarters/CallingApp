import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/apiError.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  // Known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // Prisma known request errors -> friendly messages
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return res.status(409).json({ error: { message: `Duplicate value for ${target}` } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Record not found' } });
    }
  }

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(500).json({
    error: {
      message: isProd ? 'Internal server error' : err.message || 'Internal server error',
    },
  });
}
