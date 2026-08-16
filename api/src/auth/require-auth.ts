import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { verifyAccessToken, type AccessClaims } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessClaims;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ message: 'Missing bearer token' });
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    request.auth = await verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ message: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;
    if (!request.auth || !roles.includes(request.auth.role)) {
      return reply.code(403).send({ message: 'Forbidden for this role' });
    }
  };
}
