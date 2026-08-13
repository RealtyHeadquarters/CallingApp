import { Router } from 'express';
import { z } from 'zod';
import { db, COL } from '../admin.js';
import { create } from '../lib/repo.js';
import { ApiError, asyncHandler, validate } from '../lib/framework.js';
import { hashPassword, publicUser } from '../auth.js';

const router = Router();

// One-time bootstrap: create the first ADMIN on a fresh (empty) deployment so
// someone can log in. Disabled the moment any user exists. If SETUP_KEY is set,
// the caller must supply it — an extra guard against the brief post-deploy window.
const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  mobile: z.string().min(6),
  password: z.string().min(8),
  setupKey: z.string().optional(),
});

router.post('/init', validate(schema), asyncHandler(async (req, res) => {
  const anyUser = (await db.collection(COL.users).limit(1).get()).size > 0;
  if (anyUser) throw ApiError.forbidden('Setup already completed');

  const setupKey = process.env.SETUP_KEY;
  if (setupKey && req.body.setupKey !== setupKey) throw ApiError.forbidden('Invalid setup key');

  const admin = await create(COL.users, {
    name: req.body.name,
    email: req.body.email,
    mobile: req.body.mobile,
    passwordHash: await hashPassword(req.body.password),
    role: 'ADMIN',
    status: 'ACTIVE',
    agentStatus: 'OFFLINE',
    teamId: null,
    dailyCallTarget: null,
    dailyTalktimeTarget: null,
  });
  res.status(201).json({ user: publicUser(admin) });
}));

export default router;
