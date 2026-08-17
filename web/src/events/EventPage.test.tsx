import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import type { Seat } from './api';

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

function seats(pairs: ReadonlyArray<[string, number]>): Seat[] {
  return pairs.map(([row, number], i) => ({
    id: `seat-${i}`,
    row,
    number,
    status: 'AVAILABLE' as const,
  }));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('detalhe da sessão', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('mostra título, preço e a grade só leitura', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...dune,
          seats: seats([
            ['A', 1],
            ['A', 2],
            ['B', 1],
            ['B', 2],
          ]),
        }),
      }),
    );

    renderAt('/events/evt-dune');

    expect(await screen.findByRole('heading', { name: 'Duna' })).toBeTruthy();
    expect(screen.getByText(/35,00/)).toBeTruthy();
    expect(screen.getByLabelText('A1 disponível')).toBeTruthy();
    expect(screen.getByLabelText('B2 disponível')).toBeTruthy();
    expect(screen.getByLabelText('Mapa de assentos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /A1/ })).toBeNull();
  });

  it('sessão inexistente volta ao cartaz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Event not found' }),
      }),
    );

    renderAt('/events/missing');

    expect(await screen.findByRole('heading', { name: 'Sessão não encontrada' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar ao cartaz' }).getAttribute('href')).toBe(
      '/events',
    );
  });
});
