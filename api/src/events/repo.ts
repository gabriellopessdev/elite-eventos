import { randomUUID } from 'node:crypto';
import { EventStatus, Prisma, SeatStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { allocateTicketPins } from '../tickets/pin.js';
import { signTicketId } from '../tickets/qr.js';

/** Same 8×10 as the decorative home map. Hold/lock is slice 3. */
export const SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const SEATS_PER_ROW = 10;

export const MAX_HOLD_SEATS = 8;

export const HOLD_TTL_MS = (Number(process.env.SEAT_HOLD_TTL_MINUTES) || 10) * 60_000;

type DbClient = Prisma.TransactionClient | typeof prisma;

const seatInclude = {
  seats: { orderBy: [{ row: 'asc' as const }, { number: 'asc' as const }] },
};

export type CreateEventInput = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  startsAt: Date;
  priceCents: number;
  organizerId: string;
};

export class HoldConflictError extends Error {
  constructor(message = 'One or more seats are unavailable') {
    super(message);
    this.name = 'HoldConflictError';
  }
}

export class HoldValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldValidationError';
  }
}

export class CheckoutRejectedError extends Error {
  constructor(
    message = 'Pagamento recusado (simulação ~25% para a demo — não é bug). Tente de novo.',
  ) {
    super(message);
    this.name = 'CheckoutRejectedError';
  }
}

export class ArchiveNotFoundError extends Error {
  constructor(message = 'Event not found') {
    super(message);
    this.name = 'ArchiveNotFoundError';
  }
}

export class ArchiveForbiddenError extends Error {
  constructor(message = 'Not the event organizer') {
    super(message);
    this.name = 'ArchiveForbiddenError';
  }
}

export function seatGrid() {
  return SEAT_ROWS.flatMap((row) =>
    Array.from({ length: SEATS_PER_ROW }, (_, i) => ({
      row,
      number: i + 1,
      status: SeatStatus.AVAILABLE,
    })),
  );
}

export async function createEvent(input: CreateEventInput) {
  const seats = seatGrid();

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        tmdbId: input.tmdbId,
        title: input.title,
        posterPath: input.posterPath,
        startsAt: input.startsAt,
        priceCents: input.priceCents,
        organizerId: input.organizerId,
      },
    });

    await tx.seat.createMany({
      data: seats.map((seat) => ({ ...seat, eventId: event.id })),
    });

    return tx.event.findUniqueOrThrow({
      where: { id: event.id },
      include: seatInclude,
    });
  });
}

/** Catalog of sessions — published only, no seat rows. The map is getEvent. */
export async function listEvents() {
  return prisma.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    orderBy: { startsAt: 'asc' },
  });
}

/** Lazy-expire held seats past heldUntil → AVAILABLE. */
export async function releaseExpiredSeats(tx: DbClient = prisma) {
  return tx.seat.updateMany({
    where: {
      status: SeatStatus.HELD,
      heldUntil: { lt: new Date() },
    },
    data: {
      status: SeatStatus.AVAILABLE,
      heldById: null,
      heldUntil: null,
    },
  });
}

/** Clear every HELD seat owned by this user (replace-hold semantics). */
export async function releaseUserHolds(userId: string, tx: DbClient) {
  return tx.seat.updateMany({
    where: {
      heldById: userId,
      status: SeatStatus.HELD,
    },
    data: {
      status: SeatStatus.AVAILABLE,
      heldById: null,
      heldUntil: null,
    },
  });
}

export type HoldSeatsInput = {
  eventId: string;
  userId: string;
  seatIds: string[];
};

/**
 * Atomic hold: expire → require PUBLISHED → drop user's other holds →
 * UPDATE … WHERE AVAILABLE for all seatIds. Conflict → HoldConflictError (409).
 */
export async function holdSeats({ eventId, userId, seatIds }: HoldSeatsInput) {
  if (!Array.isArray(seatIds) || seatIds.length < 1 || seatIds.length > MAX_HOLD_SEATS) {
    throw new HoldValidationError(`seatIds must have between 1 and ${MAX_HOLD_SEATS} items`);
  }
  if (new Set(seatIds).size !== seatIds.length) {
    throw new HoldValidationError('seatIds must be unique');
  }

  return prisma.$transaction(async (tx) => {
    await releaseExpiredSeats(tx);

    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || event.status !== EventStatus.PUBLISHED) {
      throw new HoldValidationError('Event not found or not published');
    }

    await releaseUserHolds(userId, tx);

    const heldUntil = new Date(Date.now() + HOLD_TTL_MS);
    const updated = await tx.seat.updateMany({
      where: {
        id: { in: seatIds },
        eventId,
        status: SeatStatus.AVAILABLE,
      },
      data: {
        status: SeatStatus.HELD,
        heldById: userId,
        heldUntil,
      },
    });

    if (updated.count !== seatIds.length) {
      throw new HoldConflictError();
    }

    const seats = await tx.seat.findMany({
      where: { id: { in: seatIds }, eventId },
      orderBy: [{ row: 'asc' }, { number: 'asc' }],
    });

    return { seats, heldUntil };
  });
}

/** Free this user's HELD seats on one event. */
export async function releaseHold({ eventId, userId }: { eventId: string; userId: string }) {
  return prisma.seat.updateMany({
    where: {
      eventId,
      heldById: userId,
      status: SeatStatus.HELD,
    },
    data: {
      status: SeatStatus.AVAILABLE,
      heldById: null,
      heldUntil: null,
    },
  });
}

/**
 * One session with seat grid. Missing / ARCHIVED → null (route maps 404).
 * Lazy-releases expired holds first.
 */
export async function getPublishedEvent(id: string) {
  await releaseExpiredSeats();
  const event = await prisma.event.findUnique({
    where: { id },
    include: seatInclude,
  });
  if (!event || event.status !== EventStatus.PUBLISHED) return null;
  return event;
}

/** Same as getPublishedEvent — Task 3 can keep calling getEvent. */
export async function getEvent(id: string) {
  return getPublishedEvent(id);
}

export type CheckoutHoldInput = {
  eventId: string;
  userId: string;
  /** Injectable for tests. Default Math.random; < 0.25 → CheckoutRejectedError. */
  random?: () => number;
};

const ticketCheckoutInclude = {
  event: { select: { id: true, title: true, posterPath: true, startsAt: true } },
  seat: { select: { row: true, number: true } },
} as const;

/**
 * Simulated payment on the caller's active hold.
 * Fail (~25%) leaves seats HELD. Success → SOLD + one Ticket per seat.
 */
export async function checkoutHold({ eventId, userId, random = Math.random }: CheckoutHoldInput) {
  await releaseExpiredSeats();

  const held = await prisma.seat.findMany({
    where: {
      eventId,
      heldById: userId,
      status: SeatStatus.HELD,
      heldUntil: { gt: new Date() },
    },
    orderBy: [{ row: 'asc' }, { number: 'asc' }],
  });

  if (held.length === 0) {
    throw new HoldValidationError('No active hold for this event');
  }

  if (random() < 0.25) {
    throw new CheckoutRejectedError();
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findMany({
      where: { eventId },
      select: { pin: true },
    });
    const pins = allocateTicketPins(
      existing.map((ticket) => ticket.pin),
      held.length,
    );

    const tickets = [];
    for (const [index, seat] of held.entries()) {
      await tx.seat.update({
        where: { id: seat.id },
        data: {
          status: SeatStatus.SOLD,
          heldById: null,
          heldUntil: null,
        },
      });

      const id = randomUUID();
      const ticket = await tx.ticket.create({
        data: {
          id,
          eventId,
          seatId: seat.id,
          userId,
          code: signTicketId(id),
          pin: pins[index]!,
          status: TicketStatus.UNUSED,
        },
        include: ticketCheckoutInclude,
      });
      tickets.push(ticket);
    }
    return tickets;
  });
}

/**
 * Soft-archive: PUBLISHED → ARCHIVED, free HELD seats, leave SOLD alone.
 * Missing / already ARCHIVED → ArchiveNotFoundError.
 * Wrong organizer → ArchiveForbiddenError.
 */
export async function archiveEvent({
  eventId,
  organizerId,
}: {
  eventId: string;
  organizerId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || event.status === EventStatus.ARCHIVED) {
      throw new ArchiveNotFoundError();
    }
    if (event.organizerId !== organizerId) {
      throw new ArchiveForbiddenError();
    }

    await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.ARCHIVED },
    });

    await tx.seat.updateMany({
      where: {
        eventId,
        status: SeatStatus.HELD,
      },
      data: {
        status: SeatStatus.AVAILABLE,
        heldById: null,
        heldUntil: null,
      },
    });

    return tx.event.findUniqueOrThrow({ where: { id: eventId } });
  });
}
