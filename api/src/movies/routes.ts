import type { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { requireRole } from '../auth/require-auth.js';
import { searchMovies, TmdbConfigError, TmdbUpstreamError } from './tmdb.js';

type SearchQuery = {
  q?: string;
};

export async function movieRoutes(app: FastifyInstance) {
  app.get('/movies/search', { preHandler: requireRole(Role.ORGANIZER) }, async (request, reply) => {
    const q = String((request.query as SearchQuery).q ?? '').trim();
    if (!q) {
      return reply.code(400).send({ message: 'q is required' });
    }

    try {
      const results = await searchMovies(q);
      return { results };
    } catch (err) {
      if (err instanceof TmdbConfigError) {
        return reply.code(503).send({ message: err.message });
      }
      if (err instanceof TmdbUpstreamError) {
        return reply.code(502).send({ message: 'TMDb upstream error' });
      }
      throw err;
    }
  });
}
