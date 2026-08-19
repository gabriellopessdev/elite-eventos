import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Role, SeatStatus, TicketStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

const accounts = [
  {
    email: 'cancel-http-org@elite.local',
    password: 'cancelorg123',
    name: 'Cancel HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'cancel-http-cli@elite.local',
    password: 'cancelcli123',
    name: 'Cancel HTTP Cli',
    role: Role.CUSTOMER,
  },
  {
    email: 'cancel-http-cli2@elite.local',
    password: 'cancelcli2123',
    name: 'Cancel HTTP Cli2',
    role: Role.CUSTOMER,
  },
] as const;

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let customerToken: string;
let customer2Token: string;

async function login(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
}

async function createSession() {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${orgToken}` },
    payload: {
      tmdbId: 438631,
      title: 'Duna Cancel',
      posterPath: '/dune-cancel.jpg',
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      priceCents: 4000,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; seats: Array<{ id: string }> };
}

async function issueViaCheckout(eventId: string, seatIds: string[], token = customerToken) {
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/hold`,
        headers: { authorization: `Bearer ${token}` },
        payload: { seatIds },
      })
    ).statusCode,
  ).toBe(200);
  const checkout = await app.inject({
    method: 'POST',
    url: `/events/${eventId}/checkout`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(checkout.statusCode).toBe(201);
  return checkout.json() as { tickets: Array<{ id: string; code: string; pin: string }> };
}

async function del(ticketId: string, token?: string) {
  return app.inject({
    method: 'DELETE',
    url: `/tickets/${ticketId}`,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

async function cleanupOrgEvents() {
  await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
  await prisma.event.deleteMany({ where: { organizerId: orgId } });
}

describe('DELETE /tickets/:id', () => {
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

    const org = await login('cancel-http-org@elite.local', 'cancelorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;

    const customer = await login('cancel-http-cli@elite.local', 'cancelcli123');
    customerToken = customer.json().accessToken as string;

    const customer2 = await login('cancel-http-cli2@elite.local', 'cancelcli2123');
    customer2Token = customer2.json().accessToken as string;
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

  test('dono: 204, some da lista e do pass, assento AVAILABLE', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;
    const { tickets } = await issueViaCheckout(event.id, [seatId]);
    const ticket = tickets[0]!;

    const res = await del(ticket.id, customerToken);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    const list = await app.inject({
      method: 'GET',
      url: '/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(list.statusCode).toBe(200);
    const ids = (list.json() as { tickets: Array<{ id: string }> }).tickets.map((t) => t.id);
    expect(ids).not.toContain(ticket.id);

    const pass = await app.inject({ method: 'GET', url: `/tickets/pass/${ticket.code}` });
    expect(pass.statusCode).toBe(404);

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.AVAILABLE);
  });

  test('sem token 401; org 403; ticket intacto', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const ticket = tickets[0]!;

    expect((await del(ticket.id)).statusCode).toBe(401);
    expect((await del(ticket.id, orgToken)).statusCode).toBe(403);

    const still = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(still.status).toBe(TicketStatus.UNUSED);
  });

  test('cli2 no ingresso do cli → 404 idêntico; UNUSED intacto', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const ticket = tickets[0]!;

    const res = await del(ticket.id, customer2Token);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: 'Ticket not found' });

    const still = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(still.status).toBe(TicketStatus.UNUSED);
  });

  test('id inexistente → 404 mesmo body', async () => {
    const res = await del(randomUUID(), customerToken);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: 'Ticket not found' });
  });

  test('USED → 409; assento SOLD', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;
    const { tickets } = await issueViaCheckout(event.id, [seatId]);
    const ticket = tickets[0]!;

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.USED },
    });

    const res = await del(ticket.id, customerToken);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ message: 'Ticket cannot be returned' });

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.SOLD);
  });

  test('startsAt passado UNUSED → 409; assento SOLD', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;
    const { tickets } = await issueViaCheckout(event.id, [seatId]);
    const ticket = tickets[0]!;

    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });

    const res = await del(ticket.id, customerToken);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ message: 'Ticket cannot be returned' });

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.SOLD);
  });

  test('segundo DELETE → 404', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);
    const ticket = tickets[0]!;

    expect((await del(ticket.id, customerToken)).statusCode).toBe(204);
    const second = await del(ticket.id, customerToken);
    expect(second.statusCode).toBe(404);
    expect(second.json()).toEqual({ message: 'Ticket not found' });
  });

  test('depois do 204, cli2 hold+checkout no mesmo assento → 201', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;
    const { tickets } = await issueViaCheckout(event.id, [seatId]);
    expect((await del(tickets[0]!.id, customerToken)).statusCode).toBe(204);

    const sold = await issueViaCheckout(event.id, [seatId], customer2Token);
    expect(sold.tickets).toHaveLength(1);
    expect(sold.tickets[0]!.id).not.toBe(tickets[0]!.id);
  });

  test('archive depois DELETE UNUSED futuro → 204', async () => {
    const event = await createSession();
    const { tickets } = await issueViaCheckout(event.id, [event.seats[0]!.id]);

    const archived = await app.inject({
      method: 'POST',
      url: `/events/${event.id}/archive`,
      headers: { authorization: `Bearer ${orgToken}` },
    });
    expect(archived.statusCode).toBe(200);

    const res = await del(tickets[0]!.id, customerToken);
    expect(res.statusCode).toBe(204);
  });
});
