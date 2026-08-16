import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';

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

  it('mostra vazio quando não há sessões', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      }),
    );

    renderAt('/events');

    expect(await screen.findByText('Nenhuma sessão publicada.')).toBeTruthy();
  });
});
