import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { EventStatus, Role, SeatStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { checkoutHold, createEvent, holdSeats } from '../src/events/repo.js';
import { signTicketId } from '../src/tickets/qr.js';
import { randomTicketPin } from '../src/tickets/pin.js';
import {
  returnTicket,
  scanTicket,
  TicketReturnConflictError,
  TicketReturnNotFoundError,
} from '../src/tickets/repo.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

describe('tickets/repo returnTicket', () => {
  let organizerId: string;
  let customerId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('cancel-repo-test');
    const org = await prisma.user.upsert({
      where: { email: 'cancel-repo-org@elite.local' },
      create: {
        email: 'cancel-repo-org@elite.local',
        passwordHash,
        name: 'Cancel Repo Org',
        role: Role.ORGANIZER,
      },
      update: { passwordHash },
    });
    const customer = await prisma.user.upsert({
      where: { email: 'cancel-repo-cli@elite.local' },
      create: {
        email: 'cancel-repo-cli@elite.local',
        passwordHash,
        name: 'Cancel Repo Cli',
        role: Role.CUSTOMER,
      },
      update: { passwordHash },
    });
    organizerId = org.id;
    customerId = customer.id;
  });

  beforeEach(async () => {
    await cleanupOrgEvents();
  });

  afterAll(async () => {
    await cleanupOrgEvents();
    await prisma.$disconnect();
  });

  async function cleanupOrgEvents() {
    await prisma.ticket.deleteMany({ where: { event: { organizerId } } });
    await prisma.event.deleteMany({ where: { organizerId } });
  }

  async function seedFutureSession(title: string) {
    return createEvent({
      tmdbId: 1,
      title,
      posterPath: '/dune.jpg',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      priceCents: 2000,
      organizerId,
    });
  }

  async function issueTicket({
    eventId,
    seatId,
    status = TicketStatus.UNUSED,
    userId = customerId,
  }: {
    eventId: string;
    seatId: string;
    status?: TicketStatus;
    userId?: string;
  }) {
    const id = randomUUID();
    const code = signTicketId(id);
    await prisma.seat.update({
      where: { id: seatId },
      data: { status: SeatStatus.SOLD, heldById: null, heldUntil: null },
    });
    return prisma.ticket.create({
      data: {
        id,
        eventId,
        seatId,
        userId,
        code,
        pin: randomTicketPin(),
        status,
      },
    });
  }

  test('UNUSED futuro: apaga ticket, assento AVAILABLE; checkout no mesmo assento emite outro', async () => {
    const event = await seedFutureSession('Cancel ok');
    const seatId = event.seats[0]!.id;
    const issued = await issueTicket({ eventId: event.id, seatId });

    await returnTicket({ ticketId: issued.id, userId: customerId });

    expect(await prisma.ticket.findUnique({ where: { id: issued.id } })).toBeNull();
    expect(await prisma.seat.findUniqueOrThrow({ where: { id: seatId } })).toMatchObject({
      status: SeatStatus.AVAILABLE,
      heldById: null,
    });

    await holdSeats({ eventId: event.id, userId: customerId, seatIds: [seatId] });
    const sold = await checkoutHold({ eventId: event.id, userId: customerId, random: () => 0.9 });
    expect(sold).toHaveLength(1);
    expect(sold[0]!.id).not.toBe(issued.id);
    expect(sold[0]!.seatId).toBe(seatId);
  });

  test('não é dono / id inexistente → TicketReturnNotFoundError; linha intacta', async () => {
    const event = await seedFutureSession('Cancel 404');
    const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });

    await expect(
      returnTicket({ ticketId: issued.id, userId: organizerId }),
    ).rejects.toBeInstanceOf(TicketReturnNotFoundError);
    await expect(
      returnTicket({ ticketId: randomUUID(), userId: customerId }),
    ).rejects.toBeInstanceOf(TicketReturnNotFoundError);

    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: issued.id } })).toMatchObject({
      status: TicketStatus.UNUSED,
    });
  });

  test('USED, EXPIRED e startsAt passado → TicketReturnConflictError; assento SOLD', async () => {
    const event = await seedFutureSession('Cancel 409');
    const used = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
      status: TicketStatus.USED,
    });
    const expired = await issueTicket({
      eventId: event.id,
      seatId: event.seats[1]!.id,
      status: TicketStatus.EXPIRED,
    });
    const future = await issueTicket({ eventId: event.id, seatId: event.seats[2]!.id });

    await expect(
      returnTicket({ ticketId: used.id, userId: customerId }),
    ).rejects.toBeInstanceOf(TicketReturnConflictError);
    await expect(
      returnTicket({ ticketId: expired.id, userId: customerId }),
    ).rejects.toBeInstanceOf(TicketReturnConflictError);
    await expect(
      returnTicket({
        ticketId: future.id,
        userId: customerId,
        now: new Date(event.startsAt.getTime() + 1000),
      }),
    ).rejects.toBeInstanceOf(TicketReturnConflictError);

    expect(await prisma.seat.findUniqueOrThrow({ where: { id: event.seats[0]!.id } })).toMatchObject({
      status: SeatStatus.SOLD,
    });
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({
      status: TicketStatus.UNUSED,
    });
  });

  test('ARCHIVED futuro ainda devolve; HMAC morto → scan invalid', async () => {
    const event = await seedFutureSession('Cancel archive');
    const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.ARCHIVED },
    });

    await returnTicket({ ticketId: issued.id, userId: customerId });
    expect(await prisma.ticket.findUnique({ where: { id: issued.id } })).toBeNull();

    const scanned = await scanTicket({ eventId: event.id, code: issued.code });
    expect(scanned.outcome).toBe('invalid');
  });

  test('segundo return do mesmo id → TicketReturnNotFoundError', async () => {
    const event = await seedFutureSession('Cancel twice');
    const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
    await returnTicket({ ticketId: issued.id, userId: customerId });
    await expect(
      returnTicket({ ticketId: issued.id, userId: customerId }),
    ).rejects.toBeInstanceOf(TicketReturnNotFoundError);
  });
});
