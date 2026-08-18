import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, resetAuthClientForTests, saveSession } from './auth';

const customer = {
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  user: {
    id: 'user-customer',
    email: 'cliente1@elite.local',
    name: 'Cliente Um',
    role: 'CUSTOMER' as const,
  },
};

function jsonRes(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('apiFetch 401 → refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSession(customer);
  });

  afterEach(() => {
    resetAuthClientForTests();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('access morto + refresh válido: novo par e o pedido original segue', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'old-refresh' });
        return jsonRes(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer old-access') return jsonRes(401, { message: 'Unauthorized' });
      if (auth === 'Bearer new-access') return jsonRes(200, { tickets: [{ id: 't1' }] });
      return jsonRes(500);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/tickets', { headers: { Authorization: 'Bearer old-access' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tickets: [{ id: 't1' }] });

    const stored = JSON.parse(localStorage.getItem('elite.session')!);
    expect(stored.accessToken).toBe('new-access');
    expect(stored.refreshToken).toBe('new-refresh');
    expect(stored.user.name).toBe('Cliente Um');
  });

  it('refresh inválido: limpa a sessão', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/refresh')) {
        return jsonRes(401, { message: 'Invalid refresh token' });
      }
      return jsonRes(401, { message: 'Unauthorized' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/tickets', { headers: { Authorization: 'Bearer old-access' } });
    expect(res.status).toBe(401);
    expect(localStorage.getItem('elite.session')).toBeNull();
  });

  it('dois 401 em paralelo disparam um só refresh', async () => {
    let refreshes = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        refreshes += 1;
        await Promise.resolve();
        return jsonRes(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer old-access') return jsonRes(401);
      return jsonRes(200, { tickets: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const headers = { Authorization: 'Bearer old-access' };
    await Promise.all([apiFetch('/tickets', { headers }), apiFetch('/tickets', { headers })]);
    expect(refreshes).toBe(1);
  });
});
