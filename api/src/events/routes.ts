import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Role, SeatStatus, type Seat } from '@prisma/client';
import { verifyAccessToken } from '../auth/jwt.js';
import { requireRole } from '../auth/require-auth.js';
import {
  CheckoutRejectedError,
  checkoutHold,
  createEvent,
  getEvent,
  HoldConflictError,
  HoldValidationError,
  holdSeats,
  listEvents,
  MAX_HOLD_SEATS,
  releaseHold,
} from './repo.js';

type CreateBody = {
  tmdbId?: unknown;
  title?: unknown;
  posterPath?: unknown;
  startsAt?: unknown;
  priceCents?: unknown;
};

type HoldBody = {
  seatIds?: unknown;
};

/** Public seat shape — never leak heldById to clients. */
function publicSeat(seat: Seat) {
  return {
    id: seat.id,
    row: seat.row,
    number: seat.number,
    status: seat.status,
    heldUntil: seat.heldUntil,
  };
}

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

function parseHoldBody(body: HoldBody | null) {
  const seatIds = body?.seatIds;
  if (!Array.isArray(seatIds)) {
    return { error: `seatIds must have between 1 and ${MAX_HOLD_SEATS} items` as const };
  }
  if (seatIds.length < 1 || seatIds.length > MAX_HOLD_SEATS) {
    return { error: `seatIds must have between 1 and ${MAX_HOLD_SEATS} items` as const };
  }
  if (!seatIds.every((id): id is string => typeof id === 'string' && id.length > 0)) {
    return { error: 'seatIds must be non-empty strings' as const };
  }
  return { seatIds };
}

/** Optional Bearer: invalid/missing → null (GET stays public). Only CUSTOMER yields claims. */
async function tryCustomerAuth(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  try {
    const claims = await verifyAccessToken(token);
    if (claims.role !== Role.CUSTOMER) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function eventRoutes(app: FastifyInstance) {
  app.get('/events', async () => {
    const events = await listEvents();
    return { events };
  });

  app.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await getEvent(id);
    if (!event) {
      return reply.code(404).send({ message: 'Event not found' });
    }

    const seats = event.seats.map(publicSeat);
    const customer = await tryCustomerAuth(request);
    if (customer) {
      const mine = event.seats.filter(
        (seat) => seat.heldById === customer.sub && seat.status === SeatStatus.HELD,
      );
      if (mine.length > 0 && mine[0]!.heldUntil) {
        return {
          ...event,
          seats,
          myHold: {
            seatIds: mine.map((seat) => seat.id),
            heldUntil: mine[0]!.heldUntil.toISOString(),
          },
        };
      }
    }

    return { ...event, seats };
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

  app.post('/events/:id/hold', { preHandler: requireRole(Role.CUSTOMER) }, async (request, reply) => {
    const parsed = parseHoldBody(request.body as HoldBody);
    if ('error' in parsed) {
      return reply.code(400).send({ message: parsed.error });
    }

    const userId = request.auth?.sub;
    if (!userId) {
      return reply.code(401).send({ message: 'Missing bearer token' });
    }

    const { id } = request.params as { id: string };

    try {
      const result = await holdSeats({
        eventId: id,
        userId,
        seatIds: parsed.seatIds,
      });
      return {
        seats: result.seats.map(publicSeat),
        heldUntil: result.heldUntil.toISOString(),
      };
    } catch (err) {
      if (err instanceof HoldConflictError) {
        return reply.code(409).send({ message: err.message });
      }
      if (err instanceof HoldValidationError) {
        if (err.message === 'Event not found or not published') {
          return reply.code(404).send({ message: 'Event not found' });
        }
        return reply.code(400).send({ message: err.message });
      }
      throw err;
    }
  });

  app.delete(
    '/events/:id/hold',
    { preHandler: requireRole(Role.CUSTOMER) },
    async (request, reply) => {
      const userId = request.auth?.sub;
      if (!userId) {
        return reply.code(401).send({ message: 'Missing bearer token' });
      }

      const { id } = request.params as { id: string };
      await releaseHold({ eventId: id, userId });
      return reply.code(204).send();
    },
  );

  app.post(
    '/events/:id/checkout',
    { preHandler: requireRole(Role.CUSTOMER) },
    async (request, reply) => {
      const userId = request.auth?.sub;
      if (!userId) {
        return reply.code(401).send({ message: 'Missing bearer token' });
      }

      const { id } = request.params as { id: string };

      try {
        const tickets = await checkoutHold({ eventId: id, userId });
        return reply.code(201).send({ tickets });
      } catch (err) {
        if (err instanceof CheckoutRejectedError) {
          return reply.code(402).send({ message: err.message });
        }
        if (err instanceof HoldValidationError) {
          return reply.code(400).send({ message: err.message });
        }
        throw err;
      }
    },
  );
}
