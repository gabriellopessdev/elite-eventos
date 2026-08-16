import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { buildApp } from '../src/app.js';
import { verifyAccessToken } from '../src/auth/jwt.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

test('GET /health → ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ ok: true, service: 'elite-eventos-api' });
});

test('GET /auth/me sem token → 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/auth/me' });
  expect(res.statusCode).toBe(401);
});

test('access token carrega role no payload', async () => {
  const token = await new SignJWT({
    role: 'CUSTOMER',
    email: 'cliente1@elite.local',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-test-id')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));

  const claims = await verifyAccessToken(token);
  expect(claims.role).toBe('CUSTOMER');
  expect(claims.sub).toBe('user-test-id');
});
