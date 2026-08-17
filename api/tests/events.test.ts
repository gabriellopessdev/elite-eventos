import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Role, SeatStatus } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { SEAT_ROWS, SEATS_PER_ROW } from '../src/events/repo.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';

const accounts = [
  {
    email: 'org@elite.local',
    password: 'org12345',
    name: 'Organizador Demo',
    role: Role.ORGANIZER,
  },
  {
    email: 'cliente1@elite.local',
    password: 'cli12345',
    name: 'Cliente Um',
    role: Role.CUSTOMER,
  },
  {
    email: 'portaria@elite.local',
    password: 'door12345',
    name: 'Portaria Demo',
    role: Role.DOOR,
  },
] as const;

const sessionBody = {
  tmdbId: 438631,
  title: 'Duna',
  posterPath: '/dune.jpg',
  startsAt: '2026-10-01T20:00:00.000Z',
  priceCents: 3500,
};

let app: FastifyInstance;
let orgToken: string;
let orgId: string;
let customerToken: string;
let doorToken: string;

async function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
}

async function postEvent(token: string | undefined, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    payload,
  });
}

async function getEvents() {
  return app.inject({ method: 'GET', url: '/events' });
}

async function getEventById(id: string) {
  return app.inject({ method: 'GET', url: `/events/${id}` });
}

describe('events API', () => {
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

    const org = await login('org@elite.local', 'org12345');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;
    customerToken = (await login('cliente1@elite.local', 'cli12345')).json().accessToken as string;
    doorToken = (await login('portaria@elite.local', 'door12345')).json().accessToken as string;
  });

  beforeEach(async () => {
    await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
    await prisma.event.deleteMany({ where: { organizerId: orgId } });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
    await prisma.event.deleteMany({ where: { organizerId: orgId } });
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /events', () => {
    test('sem token → 401', async () => {
      const res = await postEvent(undefined, sessionBody);
      expect(res.statusCode).toBe(401);
    });

    test.each([
      ['CUSTOMER', () => customerToken],
      ['DOOR', () => doorToken],
    ] as const)('como %s → 403', async (_role, token) => {
      const res = await postEvent(token(), sessionBody);
      expect(res.statusCode).toBe(403);
    });

    test('sem title → 400', async () => {
      const res = await postEvent(orgToken, { ...sessionBody, title: '' });
      expect(res.statusCode).toBe(400);
    });

    test('priceCents inválido → 400', async () => {
      const res = await postEvent(orgToken, { ...sessionBody, priceCents: 0 });
      expect(res.statusCode).toBe(400);
    });

    test('startsAt inválido → 400', async () => {
      const res = await postEvent(orgToken, { ...sessionBody, startsAt: 'amanhã' });
      expect(res.statusCode).toBe(400);
    });

    test('ORGANIZER → 201 com grade AVAILABLE', async () => {
      const res = await postEvent(orgToken, sessionBody);
      expect(res.statusCode).toBe(201);

      const body = res.json();
      expect(body).toMatchObject({
        tmdbId: 438631,
        title: 'Duna',
        posterPath: '/dune.jpg',
        priceCents: 3500,
        organizerId: orgId,
      });
      expect(body.seats).toHaveLength(SEAT_ROWS.length * SEATS_PER_ROW);
      expect(
        body.seats.every((seat: { status: string }) => seat.status === SeatStatus.AVAILABLE),
      ).toBe(true);
      expect(body.seats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ row: 'A', number: 1, status: SeatStatus.AVAILABLE }),
          expect.objectContaining({ row: 'H', number: 10, status: SeatStatus.AVAILABLE }),
        ]),
      );
    });
  });

  describe('GET /events', () => {
    test('sem token → 200', async () => {
      const res = await getEvents();
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().events)).toBe(true);
    });

    test('lista a sessão sem seats', async () => {
      await postEvent(orgToken, sessionBody);
      const res = await getEvents();
      const found = res
        .json()
        .events.find((event: { organizerId: string }) => event.organizerId === orgId);

      expect(found).toMatchObject({
        tmdbId: 438631,
        title: 'Duna',
        posterPath: '/dune.jpg',
        priceCents: 3500,
        organizerId: orgId,
      });
      expect(found).not.toHaveProperty('seats');
    });

    test('ordena por startsAt crescente', async () => {
      await postEvent(orgToken, {
        ...sessionBody,
        title: 'Depois',
        startsAt: '2026-12-01T20:00:00.000Z',
      });
      await postEvent(orgToken, {
        ...sessionBody,
        title: 'Antes',
        startsAt: '2026-09-01T20:00:00.000Z',
      });

      const ours = (await getEvents())
        .json()
        .events.filter((event: { organizerId: string }) => event.organizerId === orgId);

      expect(ours.map((event: { title: string }) => event.title)).toEqual(['Antes', 'Depois']);
    });
  });

  describe('GET /events/:id', () => {
    test('id desconhecido → 404', async () => {
      const res = await getEventById('00000000-0000-0000-0000-000000000000');
      expect(res.statusCode).toBe(404);
    });

    test('sem token → 200 com grade AVAILABLE', async () => {
      const created = await postEvent(orgToken, sessionBody);
      const id = created.json().id as string;

      const res = await getEventById(id);
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body).toMatchObject({
        id,
        tmdbId: 438631,
        title: 'Duna',
        organizerId: orgId,
      });
      expect(body.seats).toHaveLength(SEAT_ROWS.length * SEATS_PER_ROW);
      expect(
        body.seats.every((seat: { status: string }) => seat.status === SeatStatus.AVAILABLE),
      ).toBe(true);
    });
  });
});
