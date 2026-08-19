import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

/** Dedicated users so parallel events/hold/scan suites do not race. */
const accounts = [
  {
    email: 'expire-http-org@elite.local',
    password: 'expireorg123',
    name: 'Expire HTTP Org',
    role: Role.ORGANIZER,
  },
  {
    email: 'expire-http-door@elite.local',
    password: 'expiredoor123',
    name: 'Expire HTTP Door',
    role: Role.DOOR,
  },
  {
    email: 'expire-http-cli@elite.local',
    password: 'expirecli123',
    name: 'Expire HTTP Cli',
    role: Role.CUSTOMER,
  },
] as const;

const TITLE_FUTURA = 'Expire HTTP futura';
const TITLE_ANDAMENTO = 'Expire HTTP em andamento';
const TITLE_JANELA = 'Expire HTTP janela fechada';

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

async function createSession(title: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${orgToken}` },
    payload: {
      tmdbId: 438631,
      title,
      posterPath: '/expire-http.jpg',
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      priceCents: 3500,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; title: string };
}

async function getEvents(token?: string) {
  return app.inject({
    method: 'GET',
    url: '/events',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function titlesForOrg(events: Array<{ title: string; organizerId: string }>) {
  return events.filter((event) => event.organizerId === orgId).map((event) => event.title);
}

async function cleanupOrgEvents() {
  await prisma.ticket.deleteMany({ where: { event: { organizerId: orgId } } });
  await prisma.event.deleteMany({ where: { organizerId: orgId } });
}

describe('GET /events session window', () => {
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

    const org = await login('expire-http-org@elite.local', 'expireorg123');
    orgToken = org.json().accessToken as string;
    orgId = org.json().user.id as string;
    customerToken = (await login('expire-http-cli@elite.local', 'expirecli123')).json()
      .accessToken as string;
    doorToken = (await login('expire-http-door@elite.local', 'expiredoor123')).json()
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

  async function seedWindowSessions() {
    const futura = await createSession(TITLE_FUTURA);
    const emAndamento = await createSession(TITLE_ANDAMENTO);
    const janelaFechada = await createSession(TITLE_JANELA);

    await prisma.event.update({
      where: { id: futura.id },
      data: { startsAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await prisma.event.update({
      where: { id: emAndamento.id },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });
    await prisma.event.update({
      where: { id: janelaFechada.id },
      data: { startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000) },
    });

    return { futura, emAndamento, janelaFechada };
  }

  test('no token → only futura', async () => {
    await seedWindowSessions();
    const res = await getEvents();
    expect(res.statusCode).toBe(200);
    expect(titlesForOrg(res.json().events)).toEqual([TITLE_FUTURA]);
  });

  test('Bearer customer → only futura', async () => {
    await seedWindowSessions();
    const res = await getEvents(customerToken);
    expect(res.statusCode).toBe(200);
    expect(titlesForOrg(res.json().events)).toEqual([TITLE_FUTURA]);
  });

  test('Bearer door → futura + em andamento; omits janela fechada', async () => {
    await seedWindowSessions();
    const res = await getEvents(doorToken);
    expect(res.statusCode).toBe(200);
    expect(titlesForOrg(res.json().events).sort()).toEqual([TITLE_ANDAMENTO, TITLE_FUTURA].sort());
  });

  test('garbage Bearer → only futura, 200 not 401', async () => {
    await seedWindowSessions();
    const res = await getEvents('not-a-jwt');
    expect(res.statusCode).toBe(200);
    expect(titlesForOrg(res.json().events)).toEqual([TITLE_FUTURA]);
  });

  test('GET /events/:id of em andamento → 200', async () => {
    const { emAndamento } = await seedWindowSessions();
    const res = await app.inject({
      method: 'GET',
      url: `/events/${emAndamento.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe(TITLE_ANDAMENTO);
  });
});
