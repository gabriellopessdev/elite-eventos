import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { requireRole } from '../auth/require-auth.js';
import { getTicketByShareCode, listTicketsForUser } from './repo.js';

export async function ticketRoutes(app: FastifyInstance) {
  app.get('/tickets/pass/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const ticket = await getTicketByShareCode(code);
    if (!ticket) {
      return reply
        .code(404)
        .header('Cache-Control', 'no-store')
        .send({ message: 'Ticket not found' });
    }
    return reply.header('Cache-Control', 'no-store').send({ ticket });
  });

  app.get('/tickets', { preHandler: requireRole(Role.CUSTOMER) }, async (request, reply) => {
    const userId = request.auth?.sub;
    if (!userId) {
      return reply.code(401).send({ message: 'Missing bearer token' });
    }

    const tickets = await listTicketsForUser(userId);
    return { tickets };
  });
}
