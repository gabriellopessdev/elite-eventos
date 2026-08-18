import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Role, SeatStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { verifyTicketCode } from '../src/tickets/qr.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

/** Dedicated users so parallel hold/events suites do not race. */
const accounts = [
  {
    email: 'checkout-http-org@elite.local',
    password: 'checkoutorg123',
    name: 'Checkout HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'checkout-http-a@elite.local',
    password: 'checkoutcli123',
    name: 'Checkout HTTP A',
    role: Role.CUSTOMER,
  },
] as const;

const sessionBody = {
  tmdbId: 438631,
  title: 'Duna Checkout',
  posterPath: '/dune-checkout.jpg',
  startsAt: '2026-11-01T20:00:00.000Z',
  priceCents: 4000,
};

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let customerToken: string;
let customerId: string;

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
    seats: Array<{ id: string; status: string }>;
  };
}

async function postHold(eventId: string, seatIds: string[]) {
  return app.inject({
    method: 'POST',
    url: `/events/${eventId}/hold`,
    headers: { authorization: `Bearer ${customerToken}` },
    payload: { seatIds },
  });
}

async function postCheckout(eventId: string) {
  return app.inject({
    method: 'POST',
    url: `/events/${eventId}/checkout`,
    headers: { authorization: `Bearer ${customerToken}` },
  });
}

async function getTickets() {
  return app.inject({
    method: 'GET',
    url: '/tickets',
    headers: { authorization: `Bearer ${customerToken}` },
  });
}

async function cleanupOrgEvents() {
  await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
  await prisma.event.deleteMany({ where: { organizerId: orgId } });
}

describe('checkout + tickets API', () => {
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

    const org = await login('checkout-http-org@elite.local', 'checkoutorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;

    const customer = await login('checkout-http-a@elite.local', 'checkoutcli123');
    customerToken = customer.json().accessToken as string;
    customerId = customer.json().user.id as string;
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

  test('checkout sem hold → 400', async () => {
    const event = await createSession();
    const res = await postCheckout(event.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/hold/i);
  });

  test('random < 0.25 → 402 e seats permanecem HELD', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.24);

    const event = await createSession();
    const seatIds = [event.seats[0]!.id, event.seats[1]!.id];
    expect((await postHold(event.id, seatIds)).statusCode).toBe(200);

    const res = await postCheckout(event.id);
    expect(res.statusCode).toBe(402);
    expect(res.json().message).toBe(
      'Pagamento recusado (simulação ~25% para a demo — não é bug). Tente de novo.',
    );

    const seats = await prisma.seat.findMany({ where: { id: { in: seatIds } } });
    expect(seats).toHaveLength(2);
    for (const seat of seats) {
      expect(seat.status).toBe(SeatStatus.HELD);
      expect(seat.heldById).toBe(customerId);
    }

    const ticketCount = await prisma.ticket.count({
      where: { userId: customerId, eventId: event.id },
    });
    expect(ticketCount).toBe(0);
  });

  test('random >= 0.25 → 201, seats SOLD, N tickets com codes válidos', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const event = await createSession();
    const seatIds = [event.seats[0]!.id, event.seats[1]!.id, event.seats[2]!.id];
    expect((await postHold(event.id, seatIds)).statusCode).toBe(200);

    const res = await postCheckout(event.id);
    expect(res.statusCode).toBe(201);

    const body = res.json() as {
      tickets: Array<{
        id: string;
        code: string;
        pin: string;
        eventId: string;
        seatId: string;
        event: { id: string; title: string };
        seat: { row: string; number: number };
      }>;
    };
    expect(body.tickets).toHaveLength(3);

    const pins = new Set<string>();
    for (const ticket of body.tickets) {
      expect(verifyTicketCode(ticket.code)).toBe(ticket.id);
      expect(ticket.pin).toMatch(/^\d{6}$/);
      expect(pins.has(ticket.pin)).toBe(false);
      pins.add(ticket.pin);
      expect(ticket.eventId).toBe(event.id);
      expect(ticket.event.id).toBe(event.id);
      expect(seatIds).toContain(ticket.seatId);
    }

    const seats = await prisma.seat.findMany({ where: { id: { in: seatIds } } });
    for (const seat of seats) {
      expect(seat.status).toBe(SeatStatus.SOLD);
      expect(seat.heldById).toBeNull();
      expect(seat.heldUntil).toBeNull();
    }
  });

  test('GET /tickets retorna os ingressos (agrupáveis por eventId)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const event = await createSession();
    const seatIds = [event.seats[0]!.id, event.seats[1]!.id];
    expect((await postHold(event.id, seatIds)).statusCode).toBe(200);
    expect((await postCheckout(event.id)).statusCode).toBe(201);

    const res = await getTickets();
    expect(res.statusCode).toBe(200);

    const { tickets } = res.json() as {
      tickets: Array<{
        id: string;
        code: string;
        pin: string;
        eventId: string;
        createdAt: string;
        event: { id: string; title: string; posterPath: string | null; startsAt: string };
        seat: { row: string; number: number };
      }>;
    };

    expect(tickets).toHaveLength(2);
    expect(tickets.every((t) => t.eventId === event.id)).toBe(true);

    const byEvent = Map.groupBy(tickets, (t) => t.eventId);
    expect(byEvent.get(event.id)).toHaveLength(2);

    for (const ticket of tickets) {
      expect(verifyTicketCode(ticket.code)).toBe(ticket.id);
      expect(ticket.pin).toMatch(/^\d{6}$/);
      expect(ticket.event).toMatchObject({
        id: event.id,
        title: sessionBody.title,
        posterPath: sessionBody.posterPath,
      });
      expect(ticket.seat).toEqual(
        expect.objectContaining({ row: expect.any(String), number: expect.any(Number) }),
      );
    }

    // newest first
    expect(new Date(tickets[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(tickets[1]!.createdAt).getTime(),
    );
  });
});
