import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

// Call queue / "Call Next" (spec §38). Returns the agent's pending leads,
// prioritizing those with a due follow-up, then oldest un-contacted.
export const myQueue = asyncHandler(async (req, res) => {
  const where = {
    assignedUserId: req.user.id,
    leadStatus: { notIn: ['CONVERTED', 'NOT_INTERESTED', 'LOST'] },
  };

  const leads = await prisma.client.findMany({
    where,
    take: 100,
    orderBy: [{ leadStatus: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, leadId: true, name: true, mobile: true, company: true, leadStatus: true,
      followUps: {
        where: { status: 'PENDING' },
        orderBy: { followupAt: 'asc' },
        take: 1,
        select: { followupAt: true, followupType: true },
      },
    },
  });

  res.json({ data: leads, count: leads.length });
});
