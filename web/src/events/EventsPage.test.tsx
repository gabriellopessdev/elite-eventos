import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { sessionDay } from './session-day';

const dune = {
  id: 'evt-dune',
  tmdbId: 438631,
  title: 'Duna',
  posterPath: '/dune.jpg',
  startsAt: '2026-10-01T20:00:00.000Z',
  priceCents: 3500,
  organizerId: 'org-1',
  createdAt: '2026-08-16T12:00:00.000Z',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('vitrine de sessões', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lista sessões publicadas com título e preço', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [dune] }),
      }),
    );

    renderAt('/events');

    expect(await screen.findByText('Duna')).toBeTruthy();
    expect(screen.getByText(/35,00/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Duna/ }).getAttribute('href')).toBe(
      '/events/evt-dune',
    );
  });

  it('agrupa por dia e ordena pelo horário, não pela ordem da API', async () => {
    const manha = { ...dune, id: 'evt-a', title: 'Duna', startsAt: '2026-10-01T12:00:00.000Z' };
    const noite = { ...dune, id: 'evt-b', title: 'Bacurau', startsAt: '2026-10-01T18:00:00.000Z' };
    const outroDia = {
      ...dune,
      id: 'evt-c',
      title: 'Cidade de Deus',
      startsAt: '2026-10-05T12:00:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [outroDia, noite, manha] }),
      }),
    );

    renderAt('/events');

    const rows = await screen.findAllByRole('link', { name: /Duna|Bacurau|Cidade de Deus/ });
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/events/evt-a',
      '/events/evt-b',
      '/events/evt-c',
    ]);
    expect(
      screen.getAllByRole('heading', { level: 2 }).filter((h) => h.textContent !== 'Filtros'),
    ).toHaveLength(2);
  });

  it('mostra vazio quando não há sessões e esconde os filtros', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      }),
    );

    renderAt('/events');

    expect(await screen.findByRole('heading', { name: 'O cartaz abre em breve' })).toBeTruthy();
    expect(screen.queryByLabelText('Data')).toBeNull();
    expect(screen.queryByLabelText('Título')).toBeNull();
  });

  it('filtra por título e por data sem desagrupar os dias', async () => {
    const bacurau = {
      ...dune,
      id: 'evt-bac',
      title: 'Bacurau',
      startsAt: '2026-10-01T18:00:00.000Z',
    };
    const outroDia = {
      ...dune,
      id: 'evt-cid',
      title: 'Cidade de Deus',
      startsAt: '2026-10-05T12:00:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [dune, bacurau, outroDia] }),
      }),
    );

    renderAt('/events');
    expect(await screen.findByRole('link', { name: /Duna/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'bacur' } });
    expect(screen.getByRole('link', { name: /Bacurau/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Duna/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Cidade de Deus/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: sessionDay(outroDia.startsAt) },
    });
    expect(screen.getByRole('link', { name: /Cidade de Deus/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Duna/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Bacurau/ })).toBeNull();
    expect(
      screen.getAllByRole('heading', { level: 2 }).filter((h) => h.textContent !== 'Filtros'),
    ).toHaveLength(1);
  });

  it('recorte vazio mantém o cartaz e não usa o empty do cinema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [dune] }),
      }),
    );

    renderAt('/events');
    expect(await screen.findByRole('link', { name: /Duna/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nenhuma sessão bate com os filtros/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Próximas sessões' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'O cartaz abre em breve' })).toBeNull();
  });

  it('organizador vê atalho para nova sessão', async () => {
    localStorage.setItem(
      'elite.session',
      JSON.stringify({
        accessToken: 'access-org',
        refreshToken: 'refresh-org',
        user: {
          id: 'user-org',
          email: 'org@elite.local',
          name: 'Organizador Demo',
          role: 'ORGANIZER',
        },
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      }),
    );

    renderAt('/events');

    expect(
      (await screen.findAllByRole('link', { name: /Nova sessão/ }))[0].getAttribute('href'),
    ).toBe('/events/new');
  });
});
