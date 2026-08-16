import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { authRoutes } from './auth/routes.js';
import { movieRoutes } from './movies/routes.js';
import { eventRoutes } from './events/routes.js';

function corsOrigin() {
  const raw = process.env.WEB_ORIGIN;
  if (!raw) return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: corsOrigin() });

  app.get('/health', async () => ({
    ok: true,
    service: 'elite-eventos-api',
  }));

  app.register(authRoutes);
  app.register(movieRoutes);
  app.register(eventRoutes);

  return app;
}
