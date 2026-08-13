import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getById } from './lib/repo.js';
import { COL } from './admin.js';
import { ApiError, asyncHandler } from './lib/framework.js';

// In production set via `firebase functions:config` / env. Dev default for the emulator.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-firebase-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing authentication token');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await getById(COL.users, payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account is inactive');

  req.user = {
    id: user.id, name: user.name, email: user.email, mobile: user.mobile,
    role: user.role, status: user.status, teamId: user.teamId ?? null,
  };
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden('You do not have permission to perform this action'));
  next();
};

export { JWT_SECRET };
