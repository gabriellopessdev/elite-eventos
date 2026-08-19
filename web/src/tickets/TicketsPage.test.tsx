import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import type { Ticket } from '../events/api';
import { sessionDay } from '../events/session-day';

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

function seedOrganizer() {
  localStorage.setItem(
    'elite.session',
    JSON.stringify({
      accessToken: 'access-org',
      refreshToken: 'refresh-org',
      user: {
        id: 'org-1',
        email: 'org@elite.local',
        name: 'Organizador Demo',
        role: 'ORGANIZER',
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

const ticketsFixture: Ticket[] = [
  {
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
  },
  {
    id: 't2',
    eventId: 'evt-dune',
    seatId: 'seat-1',
    code: 't2.sig',
    pin: '102938',
    status: 'USED',
    createdAt: '2026-08-17T12:01:00.000Z',
    event: {
      id: 'evt-dune',
      title: 'Duna',
      posterPath: '/dune.jpg',
      startsAt: '2026-10-01T20:00:00.000Z',
    },
    seat: { row: 'A', number: 2 },
  },
  {
    id: 't3',
    eventId: 'evt-oppen',
    seatId: 'seat-9',
    code: 't3.sig',
    pin: '555111',
    status: 'UNUSED',
    createdAt: '2026-08-17T11:00:00.000Z',
    event: {
      id: 'evt-oppen',
      title: 'Oppenheimer',
      posterPath: '/opp.jpg',
      startsAt: '2026-11-02T19:30:00.000Z',
    },
    seat: { row: 'C', number: 5 },
  },
  {
    id: 't4',
    eventId: 'evt-dune',
    seatId: 'seat-2',
    code: 't4.sig',
    pin: '777000',
    status: 'EXPIRED',
    createdAt: '2026-08-17T12:02:00.000Z',
    event: {
      id: 'evt-dune',
      title: 'Duna',
      posterPath: '/dune.jpg',
      startsAt: '2026-10-01T20:00:00.000Z',
    },
    seat: { row: 'A', number: 3 },
  },
];

describe('TicketsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('visitante vê mensagem para entrar como cliente', async () => {
    renderAt('/tickets');
    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeTruthy();
    expect(screen.getByText(/Entre como cliente/i)).toBeTruthy();
  });

  it('organizador vê mensagem para entrar como cliente', async () => {
    seedOrganizer();
    renderAt('/tickets');
    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeTruthy();
    expect(screen.getByText(/Entre como cliente/i)).toBeTruthy();
  });

  it('cliente sem ingressos vê empty state', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tickets: [] }),
      }),
    );

    renderAt('/tickets');

    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeTruthy();
    expect(await screen.findByText(/ainda não tem ingressos/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver cartaz' }).getAttribute('href')).toBe('/events');
  });

  it('filtra por sessão e por status', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tickets: ticketsFixture }),
      }),
    );

    renderAt('/tickets');
    await screen.findByRole('button', { name: /Duna/ });

    // Só a sessão do Oppenheimer.
    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: 'evt-oppen' } });
    expect(screen.queryByRole('button', { name: /Duna/ })).toBeNull();
    expect(screen.getByText('Assento C5')).toBeTruthy();

    // Voltando a todas, o status corta os já usados.
    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usados' }));
    expect(screen.getByText('Assento A2')).toBeTruthy();
    expect(screen.queryByText('Assento A1')).toBeNull();
    expect(screen.queryByRole('button', { name: /Oppenheimer/ })).toBeNull();

    // Um recorte sem nenhum ingresso diz isso em vez de sumir com tudo.
    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: 'evt-oppen' } });
    expect(screen.getByText(/Nenhum ingresso bate com os filtros/i)).toBeTruthy();
  });

  it('filtra por data, encolhe o select e zera sessão órfã', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tickets: ticketsFixture }),
      }),
    );

    renderAt('/tickets');
    await screen.findByRole('button', { name: /Duna/ });

    const sessionSelect = screen.getByLabelText('Sessão') as HTMLSelectElement;
    expect([...sessionSelect.options].map((o) => o.value)).toEqual(['', 'evt-dune', 'evt-oppen']);

    fireEvent.change(sessionSelect, { target: { value: 'evt-oppen' } });
    expect(screen.getByText('Assento C5')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: sessionDay(ticketsFixture[0].event!.startsAt) },
    });

    const narrowed = screen.getByLabelText('Sessão') as HTMLSelectElement;
    expect(narrowed.value).toBe('');
    expect([...narrowed.options].map((o) => o.value)).toEqual(['', 'evt-dune']);
    expect(screen.getByRole('button', { name: /Duna/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Oppenheimer/ })).toBeNull();
  });

  it('filtra expirados e esconde no chip Não usados', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tickets: ticketsFixture }),
      }),
    );

    renderAt('/tickets');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: 'Expirados' }));
    expect(screen.getByText('Assento A3')).toBeTruthy();
    expect(screen.queryByText('Assento A1')).toBeNull();
    expect(screen.queryByText('Assento A2')).toBeNull();
    expect(screen.queryByRole('button', { name: /Oppenheimer/ })).toBeNull();
    expect(screen.getByText('Expirado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Não usados' }));
    expect(screen.queryByText('Assento A3')).toBeNull();
    expect(screen.getByText('Assento A1')).toBeTruthy();
  });

  it('cliente vê resumo dobrado e abre uma sessão por vez', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tickets: ticketsFixture }),
      }),
    );

    renderAt('/tickets');

    const duneTrigger = await screen.findByRole('button', { name: /Duna/ });
    const oppenTrigger = screen.getByRole('button', { name: /Oppenheimer/ });

    expect(duneTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(oppenTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Assento A1')).toBeTruthy();
    expect(screen.getByText('Assento A2')).toBeTruthy();
    expect(screen.queryByText('Assento C5')).toBeNull();
    expect(screen.getByText(/3 ingressos/)).toBeTruthy();
    expect(screen.getByText(/1 ingresso/)).toBeTruthy();

    fireEvent.click(oppenTrigger);

    await waitFor(() => {
      expect(oppenTrigger.getAttribute('aria-expanded')).toBe('true');
    });
    expect(duneTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Assento C5')).toBeTruthy();
    expect(screen.queryByText('Assento A1')).toBeNull();
    expect(screen.getByText('Não usado')).toBeTruthy();
  });

  it('pôster na sessão; toque no ingresso abre o passe com PIN', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tickets: ticketsFixture }),
      }),
    );

    renderAt('/tickets');
    const duneTrigger = await screen.findByRole('button', { name: /Duna/ });

    expect(duneTrigger.querySelector('img')?.getAttribute('src')).toBe(
      'https://image.tmdb.org/t/p/w185/dune.jpg',
    );
    expect(screen.queryByText('t1.sig')).toBeNull();
    expect(screen.queryByText('384 291')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Assento A1/ }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('384 291')).toBeTruthy();
    expect(screen.queryByText('t1.sig')).toBeNull();

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/t/t1.sig`);
    });
    expect(await screen.findByText('Link copiado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Assento A2/ }));
    expect(await screen.findByText('102 938')).toBeTruthy();
  });

  it('sessão sem pôster reserva o espaço com placeholder', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tickets: [
            {
              ...ticketsFixture[0],
              event: { ...ticketsFixture[0].event!, posterPath: null },
            },
          ],
        }),
      }),
    );

    renderAt('/tickets');
    const trigger = await screen.findByRole('button', { name: /Duna/ });
    expect(trigger.querySelector('img')).toBeNull();
    expect(trigger.querySelector('[data-testid="poster-placeholder"]')).toBeTruthy();
  });

  it('UNUSED futuro: Devolver no passe pede confirm e some o talão', async () => {
    seedCustomer();
    let tickets = ticketsFixture;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE' && url.includes('/tickets/t1')) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-customer');
        tickets = ticketsFixture.filter((t) => t.id !== 't1');
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes('/tickets') && method === 'GET' && !url.includes('/tickets/pass/')) {
        return { ok: true, status: 200, json: async () => ({ tickets }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/tickets');
    fireEvent.click(await screen.findByRole('button', { name: /Assento A1/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Devolver ingresso' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(
      screen.getByText('O assento volta ao mapa. Esta ação não pode ser desfeita.'),
    ).toBeTruthy();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Manter ingresso' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Devolver ingresso' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Devolver ingresso',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: /Assento A1/ })).toBeNull();
    });
    expect(screen.getByRole('button', { name: /Assento A2/ })).toBeTruthy();
  });

  it('USED não mostra Devolver; 409 deixa o passe aberto com alerta', async () => {
    seedCustomer();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET').toUpperCase() === 'DELETE') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ message: 'Ticket cannot be returned' }),
        };
      }
      if (url.includes('/tickets')) {
        return { ok: true, status: 200, json: async () => ({ tickets: ticketsFixture }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/tickets');
    fireEvent.click(await screen.findByRole('button', { name: /Assento A2/ }));
    expect(await screen.findByText('102 938')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Devolver ingresso' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    fireEvent.click(screen.getByRole('button', { name: /Assento A1/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devolver ingresso' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Devolver ingresso',
      }),
    );

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Este ingresso não pode ser devolvido.',
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Assento A1/ })).toBeTruthy();
  });
});
