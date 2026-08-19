import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import type { Ticket } from '../events/api';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr'),
  },
}));

const unusedTicket: Ticket = {
  id: 't1',
  eventId: 'evt-dune',
  seatId: 'seat-0',
  code: 't1.sig',
  pin: '384291',
  status: 'UNUSED',
  createdAt: '2026-08-17T12:00:00.000Z',
  event: {
    id: 'evt-dune',
    title: 'Duna',
    posterPath: '/dune.jpg',
    startsAt: '2026-10-01T20:00:00.000Z',
  },
  seat: { row: 'A', number: 1 },
};

function renderPass(code = 't1.sig') {
  return render(
    <MemoryRouter initialEntries={[`/t/${code}`]}>
      <App />
    </MemoryRouter>,
  );
}

function stubPass(options: { ticket?: Ticket; status?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/tickets/pass/')) {
        expect(new Headers(init?.headers).get('Authorization')).toBeNull();
        if (options.status === 404) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ message: 'Ticket not found' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ticket: options.ticket ?? unusedTicket }),
        };
      }
      return { ok: false, status: 500, json: async () => ({ message: 'unexpected' }) };
    }),
  );
}

describe('TicketPassPage /t/:code', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('UNUSED: assento, PIN, talão e marca; sem tab bar', async () => {
    stubPass({ ticket: unusedTicket });
    renderPass();

    expect(await screen.findByRole('heading', { name: 'Assento A1' })).toBeTruthy();
    expect(screen.getByText('384 291')).toBeTruthy();
    expect(screen.getByText('Duna')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Elite Eventos' }).getAttribute('href')).toBe(
      '/events',
    );
    expect(screen.queryByRole('link', { name: 'Eventos' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Entrar/ })).toBeNull();
  });

  it('USED: badge Usado e PIN visível', async () => {
    stubPass({ ticket: { ...unusedTicket, status: 'USED' } });
    renderPass();

    expect(await screen.findByRole('heading', { name: 'Assento A1' })).toBeTruthy();
    expect(screen.getAllByText('Usado').length).toBeGreaterThan(0);
    expect(screen.getByText('384 291')).toBeTruthy();
  });

  it('404: papel fantasma, sem PIN, talão com travessão', async () => {
    stubPass({ status: 404 });
    renderPass();

    expect(await screen.findByRole('heading', { name: 'Ingresso não encontrado.' })).toBeTruthy();
    expect(screen.queryByText(/384/)).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Elite Eventos' }).getAttribute('href')).toBe(
      '/events',
    );
  });

  it('HMAC lixo usa o mesmo heading do 404', async () => {
    stubPass({ status: 404 });
    renderPass('not-a-code');

    expect(await screen.findByRole('heading', { name: 'Ingresso não encontrado.' })).toBeTruthy();
    expect(screen.queryByText(/384/)).toBeNull();
  });

  it('visitante abre o ingresso sem ir ao login', async () => {
    expect(localStorage.getItem('elite.session')).toBeNull();
    stubPass({ ticket: unusedTicket });
    renderPass();

    expect(await screen.findByRole('heading', { name: 'Assento A1' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull();
  });
});
