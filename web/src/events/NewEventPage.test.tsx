import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';

const orgSession = {
  accessToken: 'access-org',
  refreshToken: 'refresh-org',
  user: {
    id: 'user-org',
    email: 'org@elite.local',
    name: 'Organizador Demo',
    role: 'ORGANIZER' as const,
  },
};

const customerSession = {
  ...orgSession,
  user: {
    id: 'user-cli',
    email: 'cliente1@elite.local',
    name: 'Cliente Um',
    role: 'CUSTOMER' as const,
  },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function seed(session: typeof orgSession | typeof customerSession) {
  localStorage.setItem('elite.session', JSON.stringify(session));
}

describe('nova sessão', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('cliente não entra no formulário', async () => {
    seed(customerSession);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      }),
    );

    renderAt('/events/new');

    expect(await screen.findByRole('heading', { name: 'O cartaz abre em breve' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Nova sessão' })).toBeNull();
  });

  it('organizador busca no TMDb e publica a sessão', async () => {
    seed(orgSession);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/movies/search')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                tmdbId: 438631,
                title: 'Duna',
                posterPath: '/dune.jpg',
                releaseDate: '2021-10-22',
              },
            ],
          }),
        };
      }
      if (method === 'POST' && url.includes('/events')) {
        return {
          ok: true,
          json: async () => ({
            id: 'evt-new',
            tmdbId: 438631,
            title: 'Duna',
            posterPath: '/dune.jpg',
            startsAt: '2026-10-01T23:00:00.000Z',
            priceCents: 3500,
            organizerId: 'user-org',
            createdAt: '2026-08-16T12:00:00.000Z',
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          events: [
            {
              id: 'evt-new',
              tmdbId: 438631,
              title: 'Duna',
              posterPath: '/dune.jpg',
              startsAt: '2026-10-01T23:00:00.000Z',
              priceCents: 3500,
              organizerId: 'user-org',
              createdAt: '2026-08-16T12:00:00.000Z',
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/events/new');

    fireEvent.change(screen.getByLabelText('Buscar no catálogo TMDb'), {
      target: { value: 'Duna' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Duna (2021)' }));
    fireEvent.change(screen.getByLabelText('Data e horário'), {
      target: { value: '2026-10-01T20:00' },
    });
    fireEvent.change(screen.getByLabelText('Preço (R$)'), { target: { value: '35' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Publicar' })[0]);

    expect(await screen.findByText('Duna')).toBeTruthy();

    const post = fetchMock.mock.calls.find((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === 'POST';
    });
    expect(post).toBeTruthy();
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      tmdbId: 438631,
      title: 'Duna',
      posterPath: '/dune.jpg',
      priceCents: 3500,
    });
    expect(body.startsAt).toMatch(/^2026-10-01T/);
  });
});
