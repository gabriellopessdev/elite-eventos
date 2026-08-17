import { prisma } from '../db.js';

/** Customer's tickets, newest first — event + seat for /tickets grouping. */
export async function listTicketsForUser(userId: string) {
  return prisma.ticket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      event: { select: { id: true, title: true, posterPath: true, startsAt: true } },
      seat: { select: { row: true, number: true } },
    },
  });
}
