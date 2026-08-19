import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Role, SeatStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { createEvent } from '../src/events/repo.js';
import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';
import { signTicketId } from '../src/tickets/qr.js';
import { randomTicketPin } from '../src/tickets/pin.js';
import { expireTicketsPastWindow, listTicketsForUser } from '../src/tickets/repo.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

describe('tickets/repo expireTicketsPastWindow', () => {
  let organizerId: string;
  let customerId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('expire-tickets-test');
    const org = await prisma.user.upsert({
      where: { email: 'expire-tickets-org@elite.local' },
      create: {
        email: 'expire-tickets-org@elite.local',
        passwordHash,
        name: 'Expire Tickets Org',
        role: Role.ORGANIZER,
      },
      update: { passwordHash },
    });
    const customer = await prisma.user.upsert({
      where: { email: 'expire-tickets-cli@elite.local' },
      create: {
        email: 'expire-tickets-cli@elite.local',
        passwordHash,
        name: 'Expire Tickets Cli',
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

  async function seedExpiredSession(title: string) {
    return createEvent({
      tmdbId: 1,
      title,
      posterPath: null,
      startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000),
      priceCents: 2000,
      organizerId,
    });
  }

  async function issueTicket({
    eventId,
    seatId,
    status = TicketStatus.UNUSED,
  }: {
    eventId: string;
    seatId: string;
    status?: TicketStatus;
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
        userId: customerId,
        code,
        pin: randomTicketPin(),
        status,
      },
    });
  }

  test('UNUSED past scan window → EXPIRED; seat stays SOLD; USED stays USED', async () => {
    const event = await seedExpiredSession('Expire unused');
    const unused = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
    });
    const used = await issueTicket({
      eventId: event.id,
      seatId: event.seats[1]!.id,
      status: TicketStatus.USED,
    });

    await expireTicketsPastWindow();

    const expired = await prisma.ticket.findUniqueOrThrow({ where: { id: unused.id } });
    expect(expired.status).toBe(TicketStatus.EXPIRED);
    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: event.seats[0]!.id } });
    expect(seat.status).toBe(SeatStatus.SOLD);

    const stillUsed = await prisma.ticket.findUniqueOrThrow({ where: { id: used.id } });
    expect(stillUsed.status).toBe(TicketStatus.USED);
  });

  test('listTicketsForUser triggers lazy expire and returns EXPIRED', async () => {
    const event = await seedExpiredSession('Expire lazy list');
    const ticket = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
    });

    const listed = await listTicketsForUser(customerId);
    const row = listed.find((item) => item.id === ticket.id);
    expect(row?.status).toBe(TicketStatus.EXPIRED);

    const inDb = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(inDb.status).toBe(TicketStatus.EXPIRED);
  });
});
