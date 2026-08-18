import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

test('OPTIONS DELETE /hold inclui DELETE no Access-Control-Allow-Methods', async () => {
  const origin = 'https://elite-eventos-web-production.up.railway.app';
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/events/evt-cors/hold',
    headers: {
      origin,
      'access-control-request-method': 'DELETE',
      'access-control-request-headers': 'authorization',
    },
  });

  expect(res.statusCode).toBe(204);
  const methods = String(res.headers['access-control-allow-methods'] ?? '').split(/,\s*/);
  expect(methods).toContain('DELETE');
  expect(methods).toContain('POST');
  expect(res.headers['access-control-allow-origin']).toBe(origin);
});
