import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { clearSeatSelectionCache, type Seat } from './api';

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

function seedCustomer() {
  localStorage.setItem(
    'elite.session',
    JSON.stringify({
      accessToken: 'access-customer',
      refreshToken: 'refresh-customer',
      user: {
        id: 'user-customer',
        email: 'cliente1@elite.local',
        name: 'Cliente Um',
        role: 'CUSTOMER',
      },
    }),
  );
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
    sessionStorage.clear();
    clearSeatSelectionCache();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearSeatSelectionCache();
    vi.unstubAllGlobals();
  });

  it('mostra título, preço e mapa selecionável', async () => {
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
    expect(screen.getByRole('button', { name: 'A1 disponível' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Pagar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('visitante seleciona assento e Pagar vai ao login com next', async () => {
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
          ]),
        }),
      }),
    );

    renderAt('/events/evt-dune');

    fireEvent.click(await screen.findByRole('button', { name: 'A1 disponível' }));
    expect(screen.getByLabelText('A1 selecionado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    expect(sessionStorage.getItem('elite.seatSelection.evt-dune')).toBe(JSON.stringify(['seat-0']));
  });

  it('cliente ao Pagar faz hold e abre o checkout', async () => {
    seedCustomer();
    const heldUntil = '2026-10-01T20:10:00.000Z';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/hold') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            seats: [{ id: 'seat-0', row: 'A', number: 1, status: 'HELD', heldUntil }],
            heldUntil,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...dune,
          seats: seats([
            ['A', 1],
            ['A', 2],
          ]),
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/events/evt-dune');

    fireEvent.click(await screen.findByRole('button', { name: 'A1 disponível' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Checkout' })).toBeTruthy();

    await waitFor(() => {
      const holdCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/hold') && (init as RequestInit)?.method === 'POST',
      );
      expect(holdCall).toBeTruthy();
    });
  });

  it('checkout 201 navega para /tickets sem DELETE hold', async () => {
    seedCustomer();
    const heldUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/checkout') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ tickets: [{ id: 't1', eventId: 'evt-dune', seatId: 'seat-0' }] }),
        };
      }
      if (url.includes('/hold') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            seats: [{ id: 'seat-0', row: 'A', number: 1, status: 'HELD', heldUntil }],
            heldUntil,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...dune,
          seats: seats([
            ['A', 1],
            ['A', 2],
          ]),
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/events/evt-dune');

    fireEvent.click(await screen.findByRole('button', { name: 'A1 disponível' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeTruthy();

    const deleteHold = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/hold') && (init as RequestInit)?.method === 'DELETE',
    );
    expect(deleteHold).toBeUndefined();
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
