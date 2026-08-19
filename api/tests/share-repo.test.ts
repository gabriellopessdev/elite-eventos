import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Role, SeatStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { createEvent } from '../src/events/repo.js';
import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';
import { signTicketId } from '../src/tickets/qr.js';
import { randomTicketPin } from '../src/tickets/pin.js';
import { getTicketByShareCode } from '../src/tickets/repo.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

describe('tickets/repo getTicketByShareCode', () => {
  let organizerId: string;
  let customerId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('share-repo-test');
    const org = await prisma.user.upsert({
      where: { email: 'share-repo-org@elite.local' },
      create: {
        email: 'share-repo-org@elite.local',
        passwordHash,
        name: 'Share Repo Org',
        role: Role.ORGANIZER,
      },
      update: { passwordHash },
    });
    const customer = await prisma.user.upsert({
      where: { email: 'share-repo-cli@elite.local' },
      create: {
        email: 'share-repo-cli@elite.local',
        passwordHash,
        name: 'Share Repo Cli',
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

  test('HMAC válido devolve ingresso sem userId; não consome UNUSED', async () => {
    const event = await seedFutureSession('Share ok');
    const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });

    const found = await getTicketByShareCode(issued.code);
    expect(found).toMatchObject({
      id: issued.id,
      eventId: event.id,
      code: issued.code,
      pin: issued.pin,
      status: TicketStatus.UNUSED,
      event: { title: 'Share ok', posterPath: '/dune.jpg' },
      seat: { row: event.seats[0]!.row, number: event.seats[0]!.number },
    });
    expect(found).not.toHaveProperty('userId');

    const still = await prisma.ticket.findUniqueOrThrow({ where: { id: issued.id } });
    expect(still.status).toBe(TicketStatus.UNUSED);
  });

  test('HMAC lixo, id inexistente e UUID nu → null', async () => {
    expect(await getTicketByShareCode('not-a-code')).toBeNull();
    expect(await getTicketByShareCode(signTicketId(randomUUID()))).toBeNull();
    const event = await seedFutureSession('Share uuid');
    const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
    expect(await getTicketByShareCode(issued.id)).toBeNull();
  });

  test('UNUSED fora da janela de scan vira EXPIRED no GET; USED permanece USED', async () => {
    const event = await createEvent({
      tmdbId: 1,
      title: 'Share expired',
      posterPath: null,
      startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000),
      priceCents: 2000,
      organizerId,
    });
    const unused = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
    const used = await issueTicket({
      eventId: event.id,
      seatId: event.seats[1]!.id,
      status: TicketStatus.USED,
    });

    const expired = await getTicketByShareCode(unused.code);
    expect(expired?.status).toBe(TicketStatus.EXPIRED);
    expect(
      await prisma.seat.findUniqueOrThrow({ where: { id: event.seats[0]!.id } }),
    ).toMatchObject({
      status: SeatStatus.SOLD,
    });

    const stillUsed = await getTicketByShareCode(used.code);
    expect(stillUsed?.status).toBe(TicketStatus.USED);
  });
});
