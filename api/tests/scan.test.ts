import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { EventStatus, Role, SeatStatus, TicketStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';
import { signTicketId } from '../src/tickets/qr.js';
import { randomTicketPin } from '../src/tickets/pin.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

/** Dedicated users so parallel hold/checkout/events suites do not race. */
const accounts = [
  {
    email: 'scan-http-org@elite.local',
    password: 'scanorg123',
    name: 'Scan HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'scan-http-cli@elite.local',
    password: 'scancli123',
    name: 'Scan HTTP Cli',
    role: Role.CUSTOMER,
  },
  {
    email: 'scan-http-door@elite.local',
    password: 'scandoor123',
    name: 'Scan HTTP Door',
    role: Role.DOOR,
  },
] as const;

const sessionBody = {
  tmdbId: 438631,
  title: 'Duna Scan',
  posterPath: '/dune-scan.jpg',
  startsAt: '2026-12-15T20:00:00.000Z',
  priceCents: 3500,
};

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let customerToken: string;
let customerId: string;
let doorToken: string;

async function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
}

async function createSession() {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${orgToken}` },
    payload: sessionBody,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as {
    id: string;
    seats: Array<{ id: string; row: string; number: number; status: string }>;
  };
}

async function postScan(eventId: string, token: string | undefined, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/events/${eventId}/scan`,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    payload,
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
  const ticket = await prisma.ticket.create({
    data: { id, eventId, seatId, userId: customerId, code, pin: randomTicketPin(), status },
  });
  return { ticket, code };
}

async function cleanupOrgEvents() {
  await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
  await prisma.event.deleteMany({ where: { organizerId: orgId } });
}

describe('POST /events/:id/scan', () => {
  beforeAll(async () => {
    for (const row of accounts) {
      const passwordHash = await hashPassword(row.password);
      await prisma.user.upsert({
        where: { email: row.email },
        create: {
          email: row.email,
          passwordHash,
          name: row.name,
          role: row.role,
        },
        update: { passwordHash, name: row.name, role: row.role },
      });
    }

    app = buildApp();
    await app.ready();

    const org = await login('scan-http-org@elite.local', 'scanorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;

    const customer = await login('scan-http-cli@elite.local', 'scancli123');
    customerToken = customer.json().accessToken as string;
    customerId = customer.json().user.id as string;

    doorToken = (await login('scan-http-door@elite.local', 'scandoor123')).json()
      .accessToken as string;
  });

  beforeEach(async () => {
    await cleanupOrgEvents();
  });

  afterAll(async () => {
    await cleanupOrgEvents();
    await app.close();
    await prisma.$disconnect();
  });

  test.each([
    ['anon', undefined, 401],
    ['CUSTOMER', () => customerToken, 403],
    ['ORGANIZER', () => orgToken, 403],
  ] as const)('POST scan as %s → %i', async (_label, tokenFn, status) => {
    const event = await createSession();
    const token = tokenFn ? tokenFn() : undefined;
    const res = await postScan(event.id, token, { code: 'any' });
    expect(res.statusCode).toBe(status);
  });

  test('DOOR + published session → 200', async () => {
    const event = await createSession();
    const res = await postScan(event.id, doorToken, { code: 'any' });
    expect(res.statusCode).toBe(200);
  });

  test('missing event → 404', async () => {
    const res = await postScan('00000000-0000-0000-0000-000000000000', doorToken, { code: 'any' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Event not found');
  });

  test('ARCHIVED event → 404', async () => {
    const event = await createSession();
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.ARCHIVED },
    });

    const res = await postScan(event.id, doorToken, { code: 'any' });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Event not found');
  });

  test.each([{}, { code: '   ' }] as const)('empty code %j → 400', async (payload) => {
    const event = await createSession();
    const res = await postScan(event.id, doorToken, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('code is required');
  });

  test('first UNUSED scan → 200 valid + seat', async () => {
    const event = await createSession();
    const seat = event.seats[0]!;
    const { code } = await issueTicket({ eventId: event.id, seatId: seat.id });

    const res = await postScan(event.id, doorToken, { code });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      outcome: 'valid',
      seat: { row: seat.row, number: seat.number },
    });
  });

  test('garbage code → 200 invalid', async () => {
    const event = await createSession();
    const res = await postScan(event.id, doorToken, { code: 'not-a-ticket' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: 'invalid' });
  });

  test('ticket from another session → 200 wrong_event', async () => {
    const sessionA = await createSession();
    const sessionB = await createSession();
    const { code } = await issueTicket({
      eventId: sessionB.id,
      seatId: sessionB.seats[0]!.id,
    });

    const res = await postScan(sessionA.id, doorToken, { code });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: 'wrong_event' });
  });

  test('second scan of same code on right session → 200 used', async () => {
    const event = await createSession();
    const { code } = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
    });

    expect((await postScan(event.id, doorToken, { code })).statusCode).toBe(200);

    const second = await postScan(event.id, doorToken, { code });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ outcome: 'used' });
  });

  test('6-digit PIN on the right session → 200 valid', async () => {
    const event = await createSession();
    const seat = event.seats[0]!;
    const { ticket } = await issueTicket({
      eventId: event.id,
      seatId: seat.id,
    });

    const res = await postScan(event.id, doorToken, { code: ticket.pin });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      outcome: 'valid',
      seat: { row: seat.row, number: seat.number },
    });
  });

  test('UNUSED HMAC on session past scan window → 200 expired', async () => {
    const event = await createSession();
    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000) },
    });
    const { code } = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
    });

    const res = await postScan(event.id, doorToken, { code });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: 'expired' });
  });

  test('UNUSED PIN on session past scan window → 200 expired', async () => {
    const event = await createSession();
    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000) },
    });
    const { ticket } = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
    });

    const res = await postScan(event.id, doorToken, { code: ticket.pin });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: 'expired' });
  });

  test('USED ticket on session past scan window → 200 used', async () => {
    const event = await createSession();
    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000) },
    });
    const { code } = await issueTicket({
      eventId: event.id,
      seatId: event.seats[0]!.id,
      status: TicketStatus.USED,
    });

    const res = await postScan(event.id, doorToken, { code });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: 'used' });
  });
});
