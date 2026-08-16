import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

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

let app: FastifyInstance;

async function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
}

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
});

beforeEach(async () => {
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { in: accounts.map((row) => row.email) } } },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

test('POST /auth/login sem email ou senha → 400', async () => {
  const res = await login('', '');
  expect(res.statusCode).toBe(400);
});

test('POST /auth/login com senha errada → 401', async () => {
  const res = await login('org@elite.local', 'wrong-password');
  expect(res.statusCode).toBe(401);
});

test.each(accounts)('POST /auth/login como $role → access, refresh e user', async (account) => {
  const res = await login(account.email, account.password);
  expect(res.statusCode).toBe(200);

  const body = res.json();
  expect(body.accessToken).toEqual(expect.any(String));
  expect(body.refreshToken).toEqual(expect.any(String));
  expect(body.user).toMatchObject({
    email: account.email,
    name: account.name,
    role: account.role,
  });
});

test('GET /auth/me com access do login → perfil', async () => {
  const logged = await login('org@elite.local', 'org12345');
  const { accessToken, user } = logged.json();

  const res = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    id: user.id,
    email: 'org@elite.local',
    role: Role.ORGANIZER,
  });
});

test('POST /auth/refresh rotaciona o par e invalida o refresh antigo', async () => {
  const logged = await login('cliente1@elite.local', 'cli12345');
  const oldRefresh = logged.json().refreshToken as string;

  const rotated = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: oldRefresh },
  });
  expect(rotated.statusCode).toBe(200);
  const next = rotated.json();
  expect(next.accessToken).toEqual(expect.any(String));
  expect(next.refreshToken).not.toBe(oldRefresh);

  const reuse = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: oldRefresh },
  });
  expect(reuse.statusCode).toBe(401);
});

test('reuse de refresh rotacionado revoga a família', async () => {
  const logged = await login('portaria@elite.local', 'door12345');
  const firstRefresh = logged.json().refreshToken as string;

  const rotated = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: firstRefresh },
  });
  const familyRefresh = rotated.json().refreshToken as string;

  await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: firstRefresh },
  });

  const afterReuse = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken: familyRefresh },
  });
  expect(afterReuse.statusCode).toBe(401);
});

test('POST /auth/logout revoga o refresh; token desconhecido ainda é 204', async () => {
  const logged = await login('org@elite.local', 'org12345');
  const refreshToken = logged.json().refreshToken as string;

  const logout = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    payload: { refreshToken },
  });
  expect(logout.statusCode).toBe(204);

  const refresh = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken },
  });
  expect(refresh.statusCode).toBe(401);

  const unknown = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    payload: { refreshToken: 'not-a-real-token' },
  });
  expect(unknown.statusCode).toBe(204);
});
