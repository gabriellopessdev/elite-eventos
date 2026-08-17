import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { EventStatus, Role, SeatStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

/** Dedicated users so parallel events.test / hold.test do not race on the same org. */
const accounts = [
  {
    email: 'hold-http-org@elite.local',
    password: 'holdorg123',
    name: 'Hold HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'hold-http-a@elite.local',
    password: 'holdcli123',
    name: 'Hold HTTP A',
    role: Role.CUSTOMER,
  },
  {
    email: 'hold-http-b@elite.local',
    password: 'holdcli123',
    name: 'Hold HTTP B',
    role: Role.CUSTOMER,
  },
  {
    email: 'hold-http-door@elite.local',
    password: 'holddoor123',
    name: 'Hold HTTP Door',
    role: Role.DOOR,
  },
] as const;

const sessionBody = {
  tmdbId: 438631,
  title: 'Duna Hold',
  posterPath: '/dune.jpg',
  startsAt: '2026-10-01T20:00:00.000Z',
  priceCents: 3500,
};

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let customer1Token: string;
let customer2Token: string;
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
    seats: Array<{ id: string; status: string; heldById?: string | null }>;
  };
}

async function postHold(eventId: string, token: string | undefined, seatIds: unknown) {
  return app.inject({
    method: 'POST',
    url: `/events/${eventId}/hold`,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    payload: { seatIds },
  });
}

async function deleteHold(eventId: string, token: string) {
  return app.inject({
    method: 'DELETE',
    url: `/events/${eventId}/hold`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function getEvent(eventId: string, token?: string) {
  return app.inject({
    method: 'GET',
    url: `/events/${eventId}`,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe('hold API', () => {
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

    const org = await login('hold-http-org@elite.local', 'holdorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;
    customer1Token = (await login('hold-http-a@elite.local', 'holdcli123')).json()
      .accessToken as string;
    customer2Token = (await login('hold-http-b@elite.local', 'holdcli123')).json()
      .accessToken as string;
    doorToken = (await login('hold-http-door@elite.local', 'holddoor123')).json()
      .accessToken as string;
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({ where: { organizerId: orgId } });
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { organizerId: orgId } });
    await app.close();
    await prisma.$disconnect();
  });

  test('dois customers no mesmo seatId → um 200 e outro 409', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;

    const first = await postHold(event.id, customer1Token, [seatId]);
    const second = await postHold(event.id, customer2Token, [seatId]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);

    const body = first.json();
    expect(body.heldUntil).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(body.heldUntil))).toBe(false);
    expect(body.seats).toEqual([
      expect.objectContaining({
        id: seatId,
        status: SeatStatus.HELD,
      }),
    ]);
    expect(body.seats[0]).not.toHaveProperty('heldById');
  });

  test('replace: segundo POST com outros seats libera os primeiros', async () => {
    const event = await createSession();
    const firstSeat = event.seats[0]!.id;
    const secondSeat = event.seats[1]!.id;

    expect((await postHold(event.id, customer1Token, [firstSeat])).statusCode).toBe(200);
    expect((await postHold(event.id, customer1Token, [secondSeat])).statusCode).toBe(200);

    const seats = await prisma.seat.findMany({
      where: { id: { in: [firstSeat, secondSeat] } },
    });
    const byId = Object.fromEntries(seats.map((s) => [s.id, s]));
    expect(byId[firstSeat]?.status).toBe(SeatStatus.AVAILABLE);
    expect(byId[secondSeat]?.status).toBe(SeatStatus.HELD);
  });

  test('held_until expirado + GET → AVAILABLE (lazy release)', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;

    await prisma.seat.update({
      where: { id: seatId },
      data: {
        status: SeatStatus.HELD,
        heldUntil: new Date(Date.now() - 60_000),
      },
    });

    const res = await getEvent(event.id);
    expect(res.statusCode).toBe(200);

    const seat = res.json().seats.find((s: { id: string }) => s.id === seatId);
    expect(seat).toMatchObject({ id: seatId, status: SeatStatus.AVAILABLE });
    expect(seat).not.toHaveProperty('heldById');
  });

  test.each([
    ['anon', undefined, 401],
    ['ORGANIZER', () => orgToken, 403],
    ['DOOR', () => doorToken, 403],
  ] as const)('POST hold como %s → %i', async (_label, tokenFn, status) => {
    const event = await createSession();
    const token = tokenFn ? tokenFn() : undefined;
    const res = await postHold(event.id, token, [event.seats[0]!.id]);
    expect(res.statusCode).toBe(status);
  });

  test('GET com bearer do holder inclui myHold', async () => {
    const event = await createSession();
    const seatIds = [event.seats[0]!.id, event.seats[1]!.id];

    const held = await postHold(event.id, customer1Token, seatIds);
    expect(held.statusCode).toBe(200);
    const heldUntil = held.json().heldUntil as string;

    const withAuth = await getEvent(event.id, customer1Token);
    expect(withAuth.statusCode).toBe(200);
    expect(withAuth.json().myHold).toEqual({
      seatIds: expect.arrayContaining(seatIds),
      heldUntil,
    });
    expect(withAuth.json().myHold.seatIds).toHaveLength(2);
    expect(withAuth.json().seats.every((s: object) => !('heldById' in s))).toBe(true);

    const asOther = await getEvent(event.id, customer2Token);
    expect(asOther.statusCode).toBe(200);
    expect(asOther.json()).not.toHaveProperty('myHold');

    const anon = await getEvent(event.id);
    expect(anon.statusCode).toBe(200);
    expect(anon.json()).not.toHaveProperty('myHold');
  });

  test('DELETE /hold → 204 e assentos AVAILABLE', async () => {
    const event = await createSession();
    const seatId = event.seats[0]!.id;

    expect((await postHold(event.id, customer1Token, [seatId])).statusCode).toBe(200);
    const res = await deleteHold(event.id, customer1Token);
    expect(res.statusCode).toBe(204);

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
    expect(seat.status).toBe(SeatStatus.AVAILABLE);
    expect(seat.heldById).toBeNull();
  });

  test('evento ARCHIVED → hold 404 e GET 404', async () => {
    const event = await createSession();
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.ARCHIVED },
    });

    const hold = await postHold(event.id, customer1Token, [event.seats[0]!.id]);
    expect(hold.statusCode).toBe(404);

    const get = await getEvent(event.id);
    expect(get.statusCode).toBe(404);
  });

  test('seatIds vazio → 400', async () => {
    const event = await createSession();
    const res = await postHold(event.id, customer1Token, []);
    expect(res.statusCode).toBe(400);
  });

  test('token inválido no GET → 200 sem myHold', async () => {
    const event = await createSession();
    await postHold(event.id, customer1Token, [event.seats[0]!.id]);

    const res = await getEvent(event.id, 'not-a-valid-token');
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('myHold');
  });
});
