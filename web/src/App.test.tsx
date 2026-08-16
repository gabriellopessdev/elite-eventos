import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { saveSession, type Session } from './auth/auth';

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

function sessionFor(role: Session['user']['role']): Session {
  return {
    accessToken: `access-${role}`,
    refreshToken: `refresh-${role}`,
    user: {
      id: `user-${role}`,
      email: `${role.toLowerCase()}@elite.local`,
      name: role,
      role,
    },
  };
}

function renderHome() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
}

function stubEvents(events: (typeof dune)[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events }),
    }),
  );
}

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    stubEvents();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('visitante vê marca e cartaz, sem Ingressos nem Portaria', async () => {
    renderHome();

    expect(screen.getAllByText('Elite Eventos').length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: 'O cartaz abre em breve' })).toBeTruthy();
    expect(screen.queryByText(/Nenhuma sessão no momento/)).toBeNull();
    expect(screen.queryAllByRole('link', { name: 'Ingressos' })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: 'Portaria' })).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: 'Eventos' }).length).toBeGreaterThan(0);
  });

  it('cliente vê Ingressos e não vê Portaria', async () => {
    saveSession(sessionFor('CUSTOMER'));
    renderHome();

    expect((await screen.findAllByRole('link', { name: 'Ingressos' })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: 'Portaria' })).toHaveLength(0);
  });

  it('organizador não vê Ingressos nem Portaria', async () => {
    saveSession(sessionFor('ORGANIZER'));
    renderHome();

    await screen.findByText('O cartaz abre em breve');
    expect(screen.queryAllByRole('link', { name: 'Ingressos' })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: 'Portaria' })).toHaveLength(0);
  });

  it('portaria vê Portaria e não vê Ingressos', async () => {
    saveSession(sessionFor('DOOR'));
    renderHome();

    expect((await screen.findAllByRole('link', { name: 'Portaria' })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: 'Ingressos' })).toHaveLength(0);
  });

  it('home em cartaz destaca a próxima sessão', async () => {
    stubEvents([dune]);
    renderHome();

    expect(await screen.findByRole('heading', { name: 'Duna' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Comprar ingresso' }).getAttribute('href')).toBe(
      '/events/evt-dune',
    );
  });
});
