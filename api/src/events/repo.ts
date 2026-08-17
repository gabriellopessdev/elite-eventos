import { SeatStatus } from '@prisma/client';
import { prisma } from '../db.js';

/** Same 8×10 as the decorative home map. Hold/lock is slice 3. */
export const SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const SEATS_PER_ROW = 10;

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

/** Catalog of sessions — no seat rows. The map is getEvent. */
export async function listEvents() {
  return prisma.event.findMany({
    orderBy: { startsAt: 'asc' },
  });
}

/** One session with its seat grid. Missing id → null (route maps 404). */
export async function getEvent(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: seatInclude,
  });
}
