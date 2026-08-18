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

export type SessionMeta = { kick?: boolean };

type SessionListener = (session: Session | null, meta?: SessionMeta) => void;

const sessionListeners = new Set<SessionListener>();
let refreshInFlight: Promise<Session | null> | null = null;

export function subscribeSession(listener: SessionListener) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function writeSession(session: Session | null, meta?: SessionMeta) {
  saveSession(session);
  for (const listener of sessionListeners) listener(session, meta);
}

export function resetAuthClientForTests() {
  refreshInFlight = null;
  sessionListeners.clear();
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
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}

async function refreshSession(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const current = loadSession();
    if (!current) return null;

    const res = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });

    if (!res.ok) {
      writeSession(null, { kick: true });
      return null;
    }

    const tokens = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!tokens.accessToken || !tokens.refreshToken) {
      writeSession(null, { kick: true });
      return null;
    }

    const next: Session = {
      ...current,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    writeSession(next);
    return next;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Fetch da API. 401 autenticado tenta um refresh (um de cada vez — reuse
 * revoga a família) e repete o pedido. Refresh morto limpa a sessão.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const res = await fetch(apiUrl(path), init);
  if (res.status !== 401 || retried || path.startsWith('/auth/')) return res;

  const headers = new Headers(init.headers);
  if (!headers.has('Authorization')) return res;

  const next = await refreshSession();
  if (!next) return res;

  headers.set('Authorization', `Bearer ${next.accessToken}`);
  return apiFetch(path, { ...init, headers }, true);
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
