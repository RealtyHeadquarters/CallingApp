import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { TEAM_STATUSES } from '../../utils/enums.js';

const teamSelect = {
  id: true, name: true, status: true, managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  _count: { select: { members: true, clients: true } },
  createdAt: true, updatedAt: true,
};

export const listTeams = asyncHandler(async (_req, res) => {
  const teams = await prisma.team.findMany({ select: teamSelect, orderBy: { createdAt: 'desc' } });
  res.json({ data: teams });
});

export const getTeam = asyncHandler(async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id },
    select: { ...teamSelect, members: { select: { id: true, name: true, role: true, agentStatus: true } } },
  });
  if (!team) throw ApiError.notFound('Team not found');
  res.json({ team });
});

export const createTeamSchema = z.object({
  name: z.string().min(2),
  managerId: z.string().nullable().optional(),
  status: z.enum(TEAM_STATUSES).default('ACTIVE'),
});

export const createTeam = asyncHandler(async (req, res) => {
  const team = await prisma.team.create({ data: req.body, select: teamSelect });
  recordAudit(req, { action: 'CREATE', entityType: 'Team', entityId: team.id, description: `Created team ${team.name}` });
  res.status(201).json({ team });
});

export const updateTeamSchema = createTeamSchema.partial();

export const updateTeam = asyncHandler(async (req, res) => {
  const team = await prisma.team.update({ where: { id: req.params.id }, data: req.body, select: teamSelect });
  recordAudit(req, { action: 'UPDATE', entityType: 'Team', entityId: team.id, description: `Updated team ${team.name}` });
  res.json({ team });
});
