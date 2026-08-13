import { Router } from 'express';
import { z } from 'zod';
import { db, COL } from '../admin.js';
import { getById, findMany, create, update } from '../lib/repo.js';
import { ApiError, asyncHandler, validate } from '../lib/framework.js';
import { authenticate, requireRole } from '../auth.js';
import { TEAM_STATUSES } from '../lib/enums.js';

const router = Router();
router.use(authenticate);

async function shape(team) {
  if (!team) return null;
  const [members, clients] = await Promise.all([
    db.collection(COL.users).where('teamId', '==', team.id).count().get(),
    db.collection(COL.clients).where('teamId', '==', team.id).count().get(),
  ]);
  let manager = null;
  if (team.managerId) {
    const m = await getById(COL.users, team.managerId);
    manager = m ? { id: m.id, name: m.name, email: m.email } : null;
  }
  return { ...team, manager, _count: { members: members.data().count, clients: clients.data().count } };
}

router.get('/', requireRole('ADMIN', 'MANAGER'), asyncHandler(async (_req, res) => {
  const teams = await findMany(COL.teams, (c) => c.orderBy('createdAt', 'desc'));
  res.json({ data: await Promise.all(teams.map(shape)) });
}));

router.get('/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const team = await getById(COL.teams, req.params.id);
  if (!team) throw ApiError.notFound('Team not found');
  res.json({ team: await shape(team) });
}));

const createSchema = z.object({
  name: z.string().min(2),
  managerId: z.string().nullable().optional(),
  status: z.enum(TEAM_STATUSES).default('ACTIVE'),
});

router.post('/', requireRole('ADMIN'), validate(createSchema), asyncHandler(async (req, res) => {
  const team = await create(COL.teams, {
    name: req.body.name, managerId: req.body.managerId || null, status: req.body.status,
  });
  res.status(201).json({ team: await shape(team) });
}));

router.patch('/:id', requireRole('ADMIN'), validate(createSchema.partial()), asyncHandler(async (req, res) => {
  const team = await update(COL.teams, req.params.id, req.body);
  res.json({ team: await shape(team) });
}));

export default router;
