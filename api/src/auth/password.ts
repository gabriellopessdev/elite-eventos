import argon2 from 'argon2';

/** Dummy argon2 hash for login when the user is missing — keeps verify timing similar. */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$eJ9F0uxODI2gG/IVvSF0YQ$jA2Z+hPk4rycZzz+EcKt69UwKgRJkzNDv6xULO4FSck';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
