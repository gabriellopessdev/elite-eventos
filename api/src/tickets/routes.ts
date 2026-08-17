import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { requireRole } from '../auth/require-auth.js';
import { listTicketsForUser } from './repo.js';

export async function ticketRoutes(app: FastifyInstance) {
  app.get('/tickets', { preHandler: requireRole(Role.CUSTOMER) }, async (request, reply) => {
    const userId = request.auth?.sub;
    if (!userId) {
      return reply.code(401).send({ message: 'Missing bearer token' });
    }

    const tickets = await listTicketsForUser(userId);
    return { tickets };
  });
}
