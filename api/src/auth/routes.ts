import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js';
import { signAccessToken } from './jwt.js';
import { hashRefreshToken, issueRefreshToken } from './refresh.js';
import { requireAuth } from './require-auth.js';

type LoginBody = {
  email: string;
  password: string;
};

type RefreshBody = {
  refreshToken: string;
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const body = request.body as LoginBody;
    if (!body?.email || !body?.password) {
      return reply.code(400).send({ message: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const valid = await verifyPassword(hash, body.password);

    if (!user || !valid) {
      return reply.code(401).send({ message: 'Invalid credentials' });
    }

    const accessToken = await signAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
    const refreshToken = await issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = request.body as RefreshBody;
    if (!body?.refreshToken) {
      return reply.code(400).send({ message: 'refreshToken is required' });
    }

    const tokenHash = hashRefreshToken(body.refreshToken);
    const stored = await prisma.refreshToken.findFirst({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ message: 'Invalid refresh token' });
    }

    // Reuse of a rotated token → revoke the whole family (theft signal).
    if (stored.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return reply.code(401).send({ message: 'Invalid refresh token' });
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    const accessToken = await signAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
    const refreshToken = await issueRefreshToken(user.id, stored.familyId);

    return { accessToken, refreshToken };
  });

  // Idempotent: unknown / already-revoked still 204 (no enumeration).
  app.post('/auth/logout', async (request, reply) => {
    const body = request.body as RefreshBody;
    if (!body?.refreshToken) {
      return reply.code(400).send({ message: 'refreshToken is required' });
    }

    const tokenHash = hashRefreshToken(body.refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const auth = request.auth!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.sub } });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  });
}
