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

type SessionListener = (session: Session | null) => void;

let memory: Session | null | undefined;
let refreshInFlight: Promise<Session | null> | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<SessionListener>();

export function isAccessExpired(accessToken: string): boolean {
  const expMs = readAccessExpMs(accessToken);
  if (expMs === null) {
    return false;
  }
  return expMs <= Date.now();
}

function readAccessExpMs(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') {
      return null;
    }
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function watchAccessExpiry(session: Session | null) {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (!session) {
    return;
  }
  const expMs = readAccessExpMs(session.accessToken);
  if (expMs === null) {
    return;
  }
  expiryTimer = setTimeout(() => {
    void hydrateSession();
  }, Math.max(0, expMs - Date.now()));
}

export function getSession(): Session | null {
  if (memory === undefined) {
    memory = loadSession();
  }
  return memory;
}

export function commitSession(session: Session | null) {
  memory = session;
  saveSession(session);
  watchAccessExpiry(session);
  for (const listener of listeners) {
    listener(session);
  }
}

export function subscribeSession(listener: SessionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetAuthSession() {
  memory = undefined;
  refreshInFlight = null;
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

export async function hydrateSession(): Promise<Session | null> {
  const session = getSession();
  if (!session) {
    return null;
  }
  if (!isAccessExpired(session.accessToken)) {
    watchAccessExpiry(session);
    return session;
  }
  return refreshSession();
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const session = getSession();
  if (session && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  const res = await fetch(apiUrl(path), { ...init, headers });
  if (res.status !== 401 || path.startsWith('/auth/')) {
    return res;
  }

  const next = await refreshSession();
  if (!next) {
    return res;
  }

  headers.set('Authorization', `Bearer ${next.accessToken}`);
  return fetch(apiUrl(path), { ...init, headers });
}

async function refreshSession(): Promise<Session | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const session = getSession();
    if (!session) {
      return null;
    }

    const res = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (!res.ok) {
      commitSession(null);
      return null;
    }

    const tokens = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!tokens.accessToken || !tokens.refreshToken) {
      commitSession(null);
      return null;
    }

    const next: Session = {
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    commitSession(next);
    return next;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
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
