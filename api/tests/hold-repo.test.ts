import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { EventStatus, Role, SeatStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import {
  createEvent,
  HoldConflictError,
  HoldValidationError,
  holdSeats,
  listEvents,
  releaseExpiredSeats,
  releaseHold,
} from '../src/events/repo.js';

describe('events/repo hold helpers', () => {
  let organizerId: string;
  let customerA: string;
  let customerB: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('hold-repo-test');
    const org = await prisma.user.upsert({
      where: { email: 'hold-org@elite.local' },
      create: {
        email: 'hold-org@elite.local',
        passwordHash,
        name: 'Hold Org',
        role: Role.ORGANIZER,
      },
      update: { passwordHash },
    });
    const a = await prisma.user.upsert({
      where: { email: 'hold-a@elite.local' },
      create: {
        email: 'hold-a@elite.local',
        passwordHash,
        name: 'Hold A',
        role: Role.CUSTOMER,
      },
      update: { passwordHash },
    });
    const b = await prisma.user.upsert({
      where: { email: 'hold-b@elite.local' },
      create: {
        email: 'hold-b@elite.local',
        passwordHash,
        name: 'Hold B',
        role: Role.CUSTOMER,
      },
      update: { passwordHash },
    });
    organizerId = org.id;
    customerA = a.id;
    customerB = b.id;
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({ where: { organizerId } });
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { organizerId } });
    await prisma.$disconnect();
  });

  async function seedEvent() {
    return createEvent({
      tmdbId: 1,
      title: 'Hold Test',
      posterPath: null,
      startsAt: new Date('2026-11-01T20:00:00.000Z'),
      priceCents: 2000,
      organizerId,
    });
  }

  test('holdSeats locks AVAILABLE seats for user', async () => {
    const event = await seedEvent();
    const seatIds = event.seats.slice(0, 2).map((s) => s.id);

    const result = await holdSeats({ eventId: event.id, userId: customerA, seatIds });

    expect(result.seats).toHaveLength(2);
    expect(result.seats.every((s) => s.status === SeatStatus.HELD)).toBe(true);
    expect(result.seats.every((s) => s.heldById === customerA)).toBe(true);
    expect(result.heldUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test('second user same seats → HoldConflictError', async () => {
    const event = await seedEvent();
    const seatIds = [event.seats[0]!.id];

    await holdSeats({ eventId: event.id, userId: customerA, seatIds });

    await expect(
      holdSeats({ eventId: event.id, userId: customerB, seatIds }),
    ).rejects.toBeInstanceOf(HoldConflictError);
  });

  test('replace hold releases previous seats of same user', async () => {
    const event = await seedEvent();
    const first = [event.seats[0]!.id];
    const second = [event.seats[1]!.id];

    await holdSeats({ eventId: event.id, userId: customerA, seatIds: first });
    await holdSeats({ eventId: event.id, userId: customerA, seatIds: second });

    const seats = await prisma.seat.findMany({
      where: { id: { in: [...first, ...second] } },
    });
    const byId = Object.fromEntries(seats.map((s) => [s.id, s]));
    expect(byId[first[0]!]?.status).toBe(SeatStatus.AVAILABLE);
    expect(byId[second[0]!]?.status).toBe(SeatStatus.HELD);
  });

  test('empty seatIds → HoldValidationError', async () => {
    const event = await seedEvent();
    await expect(
      holdSeats({ eventId: event.id, userId: customerA, seatIds: [] }),
    ).rejects.toBeInstanceOf(HoldValidationError);
  });

  test('releaseHold frees user seats on event', async () => {
    const event = await seedEvent();
    const seatIds = [event.seats[0]!.id];
    await holdSeats({ eventId: event.id, userId: customerA, seatIds });

    await releaseHold({ eventId: event.id, userId: customerA });

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatIds[0]! } });
    expect(seat.status).toBe(SeatStatus.AVAILABLE);
    expect(seat.heldById).toBeNull();
  });

  test('releaseExpiredSeats clears past heldUntil', async () => {
    const event = await seedEvent();
    const seatId = event.seats[0]!.id;
    await prisma.seat.update({
      where: { id: seatId },
      data: {
        status: SeatStatus.HELD,
        heldById: customerA,
        heldUntil: new Date(Date.now() - 60_000),
      },
    });

    await releaseExpiredSeats();

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.AVAILABLE);
    expect(seat.heldById).toBeNull();
  });

  test('holdSeats after startsAt → HoldValidationError, seat stays AVAILABLE', async () => {
    const event = await createEvent({
      tmdbId: 1,
      title: 'Hold Test',
      posterPath: null,
      startsAt: new Date(Date.now() - 60_000),
      priceCents: 2000,
      organizerId,
    });
    const seatId = event.seats[0]!.id;

    await expect(
      holdSeats({ eventId: event.id, userId: customerA, seatIds: [seatId] }),
    ).rejects.toMatchObject({
      name: 'HoldValidationError',
      message: 'Session is no longer on sale',
    });

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.AVAILABLE);
    expect(seat.heldById).toBeNull();
  });

  test('listEvents omits ARCHIVED', async () => {
    const event = await seedEvent();
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.ARCHIVED },
    });

    const listed = await listEvents();
    expect(listed.some((e) => e.id === event.id)).toBe(false);
  });
});
