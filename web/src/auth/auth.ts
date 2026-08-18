export type Role = 'ORGANIZER' | 'CUSTOMER' | 'DOOR';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};

export const ROLE_LABEL: Record<Role, string> = {
  ORGANIZER: 'Organizador',
  CUSTOMER: 'Cliente',
  DOOR: 'Portaria',
};

/**
 * Onde cada papel começa. A portaria não tem nada a fazer no cartaz — a nav
 * dela só tem "Validar" —, então mandá-la para lá era despejar a pessoa numa
 * tela que não é a dela e cobrar um toque para chegar no scanner.
 */
export function homeRouteFor(role: Role | undefined): string {
  return role === 'DOOR' ? '/door' : '/events';
}

export const DEMO_ACCOUNTS = [
  { label: 'Cliente', email: 'cliente1@elite.local', password: 'cli12345' },
  { label: 'Organizador', email: 'org@elite.local', password: 'org12345' },
  { label: 'Portaria', email: 'portaria@elite.local', password: 'door12345' },
] as const;

const STORAGE_KEY = 'elite.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.role) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ''}${path}`;
}

export async function loginRequest(email: string, password: string): Promise<Session> {
  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new AuthError(body.message ?? 'Não foi possível entrar', res.status);
  }

  return res.json() as Promise<Session>;
}

export async function logoutRequest(refreshToken: string) {
  try {
    await fetch(apiUrl('/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // local logout still proceeds
  }
}
