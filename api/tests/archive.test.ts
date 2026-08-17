import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { EventStatus, Role, SeatStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

/** Dedicated users so parallel events/hold/checkout suites do not race. */
const accounts = [
  {
    email: 'archive-http-org@elite.local',
    password: 'archiveorg123',
    name: 'Archive HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'archive-http-org2@elite.local',
    password: 'archiveorg123',
    name: 'Archive HTTP Org Two',
    role: Role.ORGANIZER,
  },
  {
    email: 'archive-http-customer@elite.local',
    password: 'archivecli123',
    name: 'Archive HTTP Customer',
    role: Role.CUSTOMER,
  },
] as const;

const sessionBody = {
  tmdbId: 438631,
  title: 'Duna Archive',
  posterPath: '/dune-archive.jpg',
  startsAt: '2026-12-01T20:00:00.000Z',
  priceCents: 3500,
};

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let otherOrgToken: string;
let otherOrgId: string;
let customerToken: string;

async function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
}

async function createSession(token = orgToken) {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: sessionBody,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as {
    id: string;
    seats: Array<{ id: string; status: string }>;
  };
}

async function postArchive(eventId: string, token: string | undefined) {
  return app.inject({
    method: 'POST',
    url: `/events/${eventId}/archive`,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

async function cleanupOrgEvents() {
  await prisma.ticket.deleteMany({
    where: { event: { organizerId: { in: [orgId, otherOrgId] } } },
  });
  await prisma.event.deleteMany({
    where: { organizerId: { in: [orgId, otherOrgId] } },
  });
}

describe('POST /events/:id/archive', () => {
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

    const org = await login('archive-http-org@elite.local', 'archiveorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;

    const other = await login('archive-http-org2@elite.local', 'archiveorg123');
    otherOrgToken = other.json().accessToken as string;
    otherOrgId = other.json().user.id as string;

    customerToken = (await login('archive-http-customer@elite.local', 'archivecli123')).json()
      .accessToken as string;
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

  test('sem token → 401', async () => {
    const { id } = await createSession();
    const res = await postArchive(id, undefined);
    expect(res.statusCode).toBe(401);
  });

  test('CUSTOMER → 403', async () => {
    const { id } = await createSession();
    const res = await postArchive(id, customerToken);
    expect(res.statusCode).toBe(403);
  });

  test('outro organizador → 403', async () => {
    const { id } = await createSession();
    const res = await postArchive(id, otherOrgToken);
    expect(res.statusCode).toBe(403);
  });

  test('id inexistente → 404', async () => {
    const res = await postArchive('00000000-0000-0000-0000-000000000000', orgToken);
    expect(res.statusCode).toBe(404);
  });

  test('dono → 200 ARCHIVED; HELD vira AVAILABLE; SOLD permanece', async () => {
    const created = await createSession();
    const heldSeat = created.seats[0]!;
    const soldSeat = created.seats[1]!;

    const hold = await app.inject({
      method: 'POST',
      url: `/events/${created.id}/hold`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { seatIds: [heldSeat.id] },
    });
    expect(hold.statusCode).toBe(200);

    await prisma.seat.update({
      where: { id: soldSeat.id },
      data: { status: SeatStatus.SOLD, heldById: null, heldUntil: null },
    });

    const res = await postArchive(created.id, orgToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: created.id,
      status: EventStatus.ARCHIVED,
      organizerId: orgId,
      title: 'Duna Archive',
    });

    const seats = await prisma.seat.findMany({
      where: { id: { in: [heldSeat.id, soldSeat.id] } },
    });
    const byId = Object.fromEntries(seats.map((s) => [s.id, s]));
    expect(byId[heldSeat.id]).toMatchObject({
      status: SeatStatus.AVAILABLE,
      heldById: null,
      heldUntil: null,
    });
    expect(byId[soldSeat.id]?.status).toBe(SeatStatus.SOLD);
  });

  test('já ARCHIVED → 404', async () => {
    const { id } = await createSession();
    expect((await postArchive(id, orgToken)).statusCode).toBe(200);
    const again = await postArchive(id, orgToken);
    expect(again.statusCode).toBe(404);
  });

  test('após archive: GET público 404; hold 404; tickets existentes em GET /tickets', async () => {
    const created = await createSession();
    const seat = created.seats[0]!;

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/events/${created.id}/hold`,
          headers: { authorization: `Bearer ${customerToken}` },
          payload: { seatIds: [seat.id] },
        })
      ).statusCode,
    ).toBe(200);

    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const checkout = await app.inject({
      method: 'POST',
      url: `/events/${created.id}/checkout`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(checkout.statusCode).toBe(201);
    const ticketIds = (checkout.json().tickets as Array<{ id: string }>).map((t) => t.id);
    expect(ticketIds).toHaveLength(1);

    const archived = await postArchive(created.id, orgToken);
    expect(archived.statusCode).toBe(200);

    const getOne = await app.inject({ method: 'GET', url: `/events/${created.id}` });
    expect(getOne.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/events' });
    expect(list.statusCode).toBe(200);
    const stillListed = (list.json().events as Array<{ id: string }>).some(
      (e) => e.id === created.id,
    );
    expect(stillListed).toBe(false);

    const holdAgain = await app.inject({
      method: 'POST',
      url: `/events/${created.id}/hold`,
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { seatIds: [created.seats[2]!.id] },
    });
    expect(holdAgain.statusCode).toBe(404);

    const tickets = await app.inject({
      method: 'GET',
      url: '/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(tickets.statusCode).toBe(200);
    const ids = (tickets.json().tickets as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(ticketIds));
  });
});
