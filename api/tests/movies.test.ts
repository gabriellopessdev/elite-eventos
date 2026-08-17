import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { Role } from '@prisma/client';
import { buildApp } from '../src/app.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';

let app: FastifyInstance;

async function tokenFor(role: Role) {
  return new SignJWT({ role, email: `${role.toLowerCase()}@elite.local` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(`user-${role}`)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

beforeEach(() => {
  process.env.TMDB_API_KEY = 'test-tmdb-key';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

test('GET /movies/search sem token → 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/movies/search?q=duna' });
  expect(res.statusCode).toBe(401);
  expect(fetchMock()).not.toHaveBeenCalled();
});

test.each([Role.CUSTOMER, Role.DOOR] as const)('GET /movies/search como %s → 403', async (role) => {
  const res = await app.inject({
    method: 'GET',
    url: '/movies/search?q=duna',
    headers: { authorization: `Bearer ${await tokenFor(role)}` },
  });
  expect(res.statusCode).toBe(403);
  expect(fetchMock()).not.toHaveBeenCalled();
});

test('GET /movies/search sem q → 400', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/movies/search',
    headers: { authorization: `Bearer ${await tokenFor(Role.ORGANIZER)}` },
  });
  expect(res.statusCode).toBe(400);
  expect(fetchMock()).not.toHaveBeenCalled();
});

test('GET /movies/search como ORGANIZER → TMDb e snapshot sem vazar a chave', async () => {
  fetchMock().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [
          {
            id: 438631,
            title: 'Duna',
            poster_path: '/dune.jpg',
            release_date: '2021-09-15',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const res = await app.inject({
    method: 'GET',
    url: '/movies/search?q=duna',
    headers: { authorization: `Bearer ${await tokenFor(Role.ORGANIZER)}` },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({
    results: [
      {
        tmdbId: 438631,
        title: 'Duna',
        posterPath: '/dune.jpg',
        releaseDate: '2021-09-15',
      },
    ],
  });

  expect(fetchMock()).toHaveBeenCalledOnce();
  const called = String(fetchMock().mock.calls[0]?.[0]);
  expect(called).toContain('api.themoviedb.org/3/search/movie');
  expect(called).toContain('query=duna');
  expect(called).toContain('api_key=test-tmdb-key');
});

test('GET /movies/search sem TMDB_API_KEY → 503', async () => {
  delete process.env.TMDB_API_KEY;
  const res = await app.inject({
    method: 'GET',
    url: '/movies/search?q=duna',
    headers: { authorization: `Bearer ${await tokenFor(Role.ORGANIZER)}` },
  });
  expect(res.statusCode).toBe(503);
  expect(fetchMock()).not.toHaveBeenCalled();
});

test('GET /movies/search com TMDb fora → 502', async () => {
  fetchMock().mockResolvedValue(new Response('upstream down', { status: 500 }));
  const res = await app.inject({
    method: 'GET',
    url: '/movies/search?q=duna',
    headers: { authorization: `Bearer ${await tokenFor(Role.ORGANIZER)}` },
  });
  expect(res.statusCode).toBe(502);
});
