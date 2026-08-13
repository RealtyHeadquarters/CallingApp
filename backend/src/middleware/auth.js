import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Verifies the Bearer token, loads the user, and attaches it to req.user.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing authentication token');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
      role: true,
      status: true,
      teamId: true,
    },
  });
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is inactive');

  req.user = user;
  next();
});
