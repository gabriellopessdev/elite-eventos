import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitSession, getSession, hydrateSession, resetAuthSession } from './auth';
import { searchMovies } from '../events/api';
import type { Role } from './auth';

const orgUser = {
  id: 'user-org',
  email: 'org@elite.local',
  name: 'Organizador Demo',
  role: 'ORGANIZER' as Role,
};

function seedExpired() {
  commitSession({
    accessToken: 'access-old',
    refreshToken: 'refresh-old',
    user: orgUser,
  });
}

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetAuthSession();
  localStorage.clear();
});

describe('authFetch refresh', () => {
  it('renova o access no 401 e conclui a busca', async () => {
    seedExpired();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get('Authorization');
      if (url.includes('/movies/search')) {
        if (auth === 'Bearer access-old') {
          return jsonRes(401, { message: 'Invalid or expired token' });
        }
        if (auth === 'Bearer access-new') {
          return jsonRes(200, {
            results: [{ tmdbId: 1, title: 'Duna', posterPath: null, releaseDate: null }],
          });
        }
      }
      if (url.includes('/auth/refresh')) {
        return jsonRes(200, { accessToken: 'access-new', refreshToken: 'refresh-new' });
      }
      return jsonRes(500, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchMovies('Duna');

    expect(results[0]?.title).toBe('Duna');
    expect(getSession()?.accessToken).toBe('access-new');
    expect(getSession()?.refreshToken).toBe('refresh-new');
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes('/auth/refresh')),
    ).toHaveLength(1);
  });

  it('desloga só quando o refresh também falha', async () => {
    seedExpired();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/movies/search')) {
          return jsonRes(401, { message: 'Invalid or expired token' });
        }
        if (url.includes('/auth/refresh')) {
          return jsonRes(401, { message: 'Invalid refresh token' });
        }
        return jsonRes(500, {});
      }),
    );

    await expect(searchMovies('Duna')).rejects.toThrow('Não foi possível buscar no TMDb');
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('elite.session')).toBeNull();
  });

  it('duas buscas 401 compartilham um único refresh', async () => {
    seedExpired();
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get('Authorization');
      if (url.includes('/movies/search')) {
        if (auth === 'Bearer access-old') {
          return jsonRes(401, { message: 'Invalid or expired token' });
        }
        return jsonRes(200, { results: [] });
      }
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return jsonRes(200, { accessToken: 'access-new', refreshToken: 'refresh-new' });
      }
      return jsonRes(500, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([searchMovies('Duna'), searchMovies('Matrix')]);

    expect(refreshCalls).toBe(1);
  });

  it('no boot, JWT vencido e refresh morto apaga a sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/auth/refresh')) {
          return jsonRes(401, { message: 'Invalid refresh token' });
        }
        return jsonRes(500, {});
      }),
    );
    commitSession({
      accessToken: jwtWithExp(Math.floor(Date.now() / 1000) - 60),
      refreshToken: 'refresh-old',
      user: orgUser,
    });

    await hydrateSession();

    expect(getSession()).toBeNull();
    expect(localStorage.getItem('elite.session')).toBeNull();
  });

  it('no boot, JWT vencido e refresh ok troca o par', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/auth/refresh')) {
          return jsonRes(200, { accessToken: 'access-new', refreshToken: 'refresh-new' });
        }
        return jsonRes(500, {});
      }),
    );
    commitSession({
      accessToken: jwtWithExp(Math.floor(Date.now() / 1000) - 60),
      refreshToken: 'refresh-old',
      user: orgUser,
    });

    const next = await hydrateSession();

    expect(next?.accessToken).toBe('access-new');
    expect(getSession()?.user.name).toBe('Organizador Demo');
  });
});

function jwtWithExp(exp: number) {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}
