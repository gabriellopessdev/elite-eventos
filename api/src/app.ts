import 'dotenv/config';
import Fastify from 'fastify';
import { authRoutes } from './auth/routes.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    ok: true,
    service: 'elite-eventos-api',
  }));

  app.register(authRoutes);

  return app;
}
