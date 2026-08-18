import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Role, SeatStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { createEvent } from '../src/events/repo.js';
import { signTicketId } from '../src/tickets/qr.js';
import { randomTicketPin } from '../src/tickets/pin.js';
import { scanTicket } from '../src/tickets/repo.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

describe('tickets/repo scanTicket', () => {
  let organizerId: string;
  let customerId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('scan-repo-test');
    const org = await prisma.user.upsert({
      where: { email: 'scan-repo-org@elite.local' },
      create: {
        email: 'scan-repo-org@elite.local',
        passwordHash,
        name: 'Scan Repo Org',
        role: Role.ORGANIZER,
      },
      update: { passwordHash },
    });
    const customer = await prisma.user.upsert({
      where: { email: 'scan-repo-cli@elite.local' },
      create: {
        email: 'scan-repo-cli@elite.local',
        passwordHash,
        name: 'Scan Repo Cli',
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

  async function seedSession(title: string) {
    return createEvent({
      tmdbId: 1,
      title,
      posterPath: null,
      startsAt: new Date('2026-11-01T20:00:00.000Z'),
      priceCents: 2000,
      organizerId,
    });
  }

  async function issueTicket({
    eventId,
    seatId,
    status = TicketStatus.UNUSED,
    pin = randomTicketPin(),
  }: {
    eventId: string;
    seatId: string;
    status?: TicketStatus;
    pin?: string;
  }) {
    const id = randomUUID();
    const code = signTicketId(id);
    await prisma.seat.update({
      where: { id: seatId },
      data: { status: SeatStatus.SOLD, heldById: null, heldUntil: null },
    });
    const ticket = await prisma.ticket.create({
      data: { id, eventId, seatId, userId: customerId, code, pin, status },
    });
    return { ticket, code };
  }

  test('garbage code and tampered sig → invalid; ticket unchanged', async () => {
    const event = await seedSession('Scan A');
    const { ticket, code } = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
    });

    const garbage = await scanTicket({ eventId: event.id, code: 'not-a-ticket' });
    expect(garbage).toEqual({ outcome: 'invalid' });

    const [id, sig] = code.split('.');
    const flipped = sig!.endsWith('A') ? `${sig!.slice(0, -1)}B` : `${sig!.slice(0, -1)}A`;
    const tampered = await scanTicket({ eventId: event.id, code: `${id}.${flipped}` });
    expect(tampered).toEqual({ outcome: 'invalid' });

    const still = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(still.status).toBe(TicketStatus.UNUSED);
  });

  test('HMAC ok for id that does not exist → invalid', async () => {
    const event = await seedSession('Scan A');
    const missingId = randomUUID();
    const code = signTicketId(missingId);

    const result = await scanTicket({ eventId: event.id, code });
    expect(result).toEqual({ outcome: 'invalid' });
  });

  test('ticket of session B scanned with eventId A → wrong_event (even if USED)', async () => {
    const sessionA = await seedSession('Scan A');
    const sessionB = await seedSession('Scan B');
    const unusedB = await issueTicket({
      eventId: sessionB.id,
      seatId: sessionB.seats[0]!.id,
    });
    const usedB = await issueTicket({
      eventId: sessionB.id,
      seatId: sessionB.seats[1]!.id,
      status: TicketStatus.USED,
    });

    const unusedScan = await scanTicket({ eventId: sessionA.id, code: unusedB.code });
    expect(unusedScan).toEqual({ outcome: 'wrong_event' });

    const usedScan = await scanTicket({ eventId: sessionA.id, code: usedB.code });
    expect(usedScan).toEqual({ outcome: 'wrong_event' });
  });

  test('USED ticket on session A → used', async () => {
    const sessionA = await seedSession('Scan A');
    const { code } = await issueTicket({
      eventId: sessionA.id,
      seatId: sessionA.seats[0]!.id,
      status: TicketStatus.USED,
    });

    const result = await scanTicket({ eventId: sessionA.id, code });
    expect(result).toEqual({ outcome: 'used' });
  });

  test('UNUSED on session A → valid + seat; second scan → used', async () => {
    const sessionA = await seedSession('Scan A');
    const seat = sessionA.seats[0]!;
    const { code } = await issueTicket({
      eventId: sessionA.id,
      seatId: seat.id,
    });

    const first = await scanTicket({ eventId: sessionA.id, code });
    expect(first).toEqual({
      outcome: 'valid',
      seat: { row: seat.row, number: seat.number },
    });

    const second = await scanTicket({ eventId: sessionA.id, code });
    expect(second).toEqual({ outcome: 'used' });
  });

  test('Promise.all two scans of the same UNUSED ticket → one valid, one used', async () => {
    const sessionA = await seedSession('Scan A');
    const { ticket, code } = await issueTicket({
      eventId: sessionA.id,
      seatId: sessionA.seats[0]!.id,
    });

    const [a, b] = await Promise.all([
      scanTicket({ eventId: sessionA.id, code }),
      scanTicket({ eventId: sessionA.id, code }),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(['used', 'valid']);

    const winner = a.outcome === 'valid' ? a : b;
    expect(winner.seat).toEqual({
      row: sessionA.seats[0]!.row,
      number: sessionA.seats[0]!.number,
    });

    const inDb = await prisma.ticket.findMany({
      where: { id: ticket.id, status: TicketStatus.USED },
    });
    expect(inDb).toHaveLength(1);
  });

  test('PIN of 6 digits on the right session → valid; unknown PIN → invalid', async () => {
    const sessionA = await seedSession('Scan A');
    const sessionB = await seedSession('Scan B');
    const seat = sessionA.seats[0]!;
    const { ticket } = await issueTicket({
      eventId: sessionA.id,
      seatId: seat.id,
      pin: '384291',
    });

    const first = await scanTicket({ eventId: sessionA.id, code: ticket.pin });
    expect(first).toEqual({
      outcome: 'valid',
      seat: { row: seat.row, number: seat.number },
    });

    const second = await scanTicket({ eventId: sessionA.id, code: ticket.pin });
    expect(second).toEqual({ outcome: 'used' });

    const otherSession = await scanTicket({ eventId: sessionB.id, code: ticket.pin });
    expect(otherSession).toEqual({ outcome: 'invalid' });

    expect(await scanTicket({ eventId: sessionA.id, code: '000000' })).toEqual({
      outcome: 'invalid',
    });
  });
});
