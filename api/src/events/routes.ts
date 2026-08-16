import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { requireRole } from '../auth/require-auth.js';
import { createEvent } from './create.js';
import { listEvents } from './list.js';

type CreateBody = {
  tmdbId?: unknown;
  title?: unknown;
  posterPath?: unknown;
  startsAt?: unknown;
  priceCents?: unknown;
};

function parseCreateBody(body: CreateBody | null) {
  const tmdbId = Number(body?.tmdbId);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const posterPath =
    body?.posterPath === null || body?.posterPath === undefined
      ? null
      : typeof body.posterPath === 'string'
        ? body.posterPath.trim() || null
        : undefined;
  const startsAtRaw = typeof body?.startsAt === 'string' ? body.startsAt : '';
  const startsAt = new Date(startsAtRaw);
  const priceCents = Number(body?.priceCents);

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { error: 'tmdbId is required' as const };
  }
  if (!title) {
    return { error: 'title is required' as const };
  }
  if (posterPath === undefined) {
    return { error: 'posterPath must be a string or null' as const };
  }
  if (!startsAtRaw || Number.isNaN(startsAt.getTime())) {
    return { error: 'startsAt must be an ISO datetime' as const };
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return { error: 'priceCents must be a positive integer' as const };
  }

  return { tmdbId, title, posterPath, startsAt, priceCents };
}

export async function eventRoutes(app: FastifyInstance) {
  app.get('/events', async () => {
    const events = await listEvents();
    return { events };
  });

  app.post('/events', { preHandler: requireRole(Role.ORGANIZER) }, async (request, reply) => {
    const parsed = parseCreateBody(request.body as CreateBody);
    if ('error' in parsed) {
      return reply.code(400).send({ message: parsed.error });
    }

    const organizerId = request.auth?.sub;
    if (!organizerId) {
      return reply.code(401).send({ message: 'Missing bearer token' });
    }

    const event = await createEvent({ ...parsed, organizerId });
    return reply.code(201).send(event);
  });
}
