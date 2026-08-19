import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Role, SeatStatus, TicketStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';
import { signTicketId } from '../src/tickets/qr.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

/** Dedicated users so parallel checkout/hold/events suites do not race. */
const accounts = [
  {
    email: 'share-http-org@elite.local',
    password: 'shareorg123',
    name: 'Share HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'share-http-cli@elite.local',
    password: 'sharecli123',
    name: 'Share HTTP Cli',
    role: Role.CUSTOMER,
  },
] as const;

const sessionBody = {
  tmdbId: 438631,
  title: 'Duna Share',
  posterPath: '/dune-share.jpg',
  startsAt: '2026-11-01T20:00:00.000Z',
  priceCents: 4000,
};

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let customerToken: string;

async function login(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
}

async function createSession() {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${orgToken}` },
    payload: sessionBody,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; seats: Array<{ id: string }> };
}

async function issueViaCheckout(eventId: string, seatIds: string[]) {
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/hold`,
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { seatIds },
      })
    ).statusCode,
  ).toBe(200);
  const checkout = await app.inject({
    method: 'POST',
    url: `/events/${eventId}/checkout`,
    headers: { authorization: `Bearer ${customerToken}` },
  });
  expect(checkout.statusCode).toBe(201);
  return checkout.json() as { tickets: Array<{ id: string; code: string; pin: string }> };
}

async function getPass(code: string, headers?: Record<string, string>) {
  return app.inject({
    method: 'GET',
    url: `/tickets/pass/${code}`,
    headers,
  });
}

async function cleanupOrgEvents() {
  await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
  await prisma.event.deleteMany({ where: { organizerId: orgId } });
}

describe('GET /tickets/pass/:code', () => {
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

    const org = await login('share-http-org@elite.local', 'shareorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;

    const customer = await login('share-http-cli@elite.local', 'sharecli123');
    customerToken = customer.json().accessToken as string;
  });

  beforeEach(async () => {
    await cleanupOrgEvents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupOrgEvents();
    await app.close();
    await prisma.$disconnect();
  });

  test('sem Authorization: 200 { ticket } sem userId, Cache-Control no-store', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const { code } = tickets[0]!;

    const res = await getPass(code);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['cache-control'])).toContain('no-store');

    const body = res.json() as { ticket: Record<string, unknown> };
    expect(body.ticket).not.toHaveProperty('userId');
    expect(body.ticket.code).toBe(code);
  });

  test('Bearer inválido no pass → 200; GET /tickets sem token → 401', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const { code } = tickets[0]!;

    const pass = await getPass(code, { authorization: 'Bearer not-a-jwt' });
    expect(pass.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/tickets' });
    expect(list.statusCode).toBe(401);
  });

  test('HMAC lixo, id inexistente e UUID nu → 404 idênticos', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const ticket = tickets[0]!;

    const notACode = await getPass('not-a-code');
    const missingId = await getPass(signTicketId(randomUUID()));
    const nakedUuid = await getPass(ticket.id);

    expect(notACode.statusCode).toBe(404);
    expect(missingId.statusCode).toBe(404);
    expect(nakedUuid.statusCode).toBe(404);
    expect(notACode.json()).toEqual({ message: 'Ticket not found' });
    expect(missingId.json()).toEqual({ message: 'Ticket not found' });
    expect(nakedUuid.json()).toEqual(notACode.json());
  });

  test('USED via update: 200 com status USED; GET não consome', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const ticket = tickets[0]!;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.USED },
    });

    const res = await getPass(ticket.code);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ticket: { status: 'USED' } });

    const still = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(still.status).toBe(TicketStatus.USED);
  });

  test('UNUSED fora da janela → 200 EXPIRED; assento permanece SOLD', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;
    const { tickets } = await issueViaCheckout(event.id, [seatId]);
    const ticket = tickets[0]!;

    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000) },
    });

    const res = await getPass(ticket.code);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ticket: { status: 'EXPIRED' } });

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.SOLD);
  });
});
