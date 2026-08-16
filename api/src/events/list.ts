import { prisma } from '../db.js';

/** Catalog of sessions — no seat rows. The map is GET by id (next). */
export async function listEvents() {
  return prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
  });
}
