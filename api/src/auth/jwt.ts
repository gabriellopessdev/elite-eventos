import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';

export type AccessClaims = {
  sub: string;
  role: Role;
  email: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(input: {
  userId: string;
  role: Role;
  email: string;
}): Promise<string> {
  return new SignJWT({ role: input.role, email: input.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_TTL ?? '15m')
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, getSecret());
  const sub = payload.sub;
  const role = payload.role as Role | undefined;
  const email = payload.email as string | undefined;
  if (!sub || !role || !email) {
    throw new Error('Invalid access token payload');
  }
  return { sub, role, email };
}
