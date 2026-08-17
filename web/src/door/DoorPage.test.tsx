import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import * as api from '../events/api';
import { ApiError, type EventSummary } from '../events/api';
import type { Role } from '../auth/auth';
import { sessionDay } from './DoorPage';

const duna: EventSummary = {
  id: 'evt-dune',
  tmdbId: 438631,
  title: 'Duna',
  posterPath: '/dune.jpg',
  startsAt: '2026-10-01T20:00:00.000Z',
  priceCents: 3500,
  organizerId: 'org-1',
  createdAt: '2026-08-16T12:00:00.000Z',
};

const oppenheimer: EventSummary = {
  id: 'evt-oppen',
  tmdbId: 872585,
  title: 'Oppenheimer',
  posterPath: '/opp.jpg',
  startsAt: '2026-11-15T20:00:00.000Z',
  priceCents: 4000,
  organizerId: 'org-1',
  createdAt: '2026-08-16T12:00:00.000Z',
};

function seedRole(role: Role, name: string) {
  localStorage.setItem(
    'elite.session',
    JSON.stringify({
      accessToken: `access-${role}`,
      refreshToken: `refresh-${role}`,
      user: { id: `user-${role}`, email: `${role.toLowerCase()}@elite.local`, name, role },
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

describe('portaria /door', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, 'listEvents').mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('cliente em /door acaba no cartaz', async () => {
    seedRole('CUSTOMER', 'Cliente Um');
    renderAt('/door');

    expect(await screen.findByRole('heading', { name: 'O cartaz abre em breve' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Validar' })).toBeNull();
  });

  it('visitante em /door vai para o login', async () => {
    renderAt('/door');

    expect(await screen.findByLabelText('E-mail')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Validar' })).toBeNull();
  });

  it('portaria filtra sessões por título e por data', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    renderAt('/door');

    expect(await screen.findByRole('heading', { name: 'Validar' })).toBeTruthy();
    expect(await screen.findByRole('option', { name: /Duna/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Escolha a sessão' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Oppenheimer/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oppen' } });
    expect(screen.getByRole('option', { name: /Oppenheimer/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Duna/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: sessionDay(duna.startsAt) },
    });
    expect(screen.getByRole('option', { name: /Duna/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Oppenheimer/ })).toBeNull();
  });

  it('sem sessão escolhida, Validar fica desabilitado', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    renderAt('/door');

    await screen.findByRole('option', { name: /Duna/ });
    const submit = screen.getByRole('button', { name: 'Validar' });
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ticket.sig' } });
    expect(submit).toHaveProperty('disabled', true);
  });

  it('cola o código e mostra Válido com o assento', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    const scan = vi.spyOn(api, 'scanEvent').mockResolvedValue({
      outcome: 'valid',
      seat: { row: 'B', number: 7 },
    });
    renderAt('/door');
    await screen.findByRole('option', { name: /Duna/ });

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: duna.id } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ticket.sig' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect((await screen.findByRole('status')).textContent).toBe('Válido · B7');
    expect(scan).toHaveBeenCalledWith(duna.id, 'ticket.sig', 'access-DOOR');
    expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe('');
  });

  it('ingresso de outra sessão mostra Sessão errada', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'wrong_event' });
    renderAt('/door');
    await screen.findByRole('option', { name: /Duna/ });

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: duna.id } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'other.sig' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect((await screen.findByRole('status')).textContent).toBe('Sessão errada');
  });

  it('mostra Ingresso inválido e Já utilizado', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    const scan = vi.spyOn(api, 'scanEvent').mockResolvedValueOnce({ outcome: 'invalid' });
    renderAt('/door');
    await screen.findByRole('option', { name: /Duna/ });

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: duna.id } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'lixo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('status')).textContent).toBe('Ingresso inválido');

    scan.mockResolvedValueOnce({ outcome: 'used' });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'used.sig' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('status')).textContent).toBe('Já utilizado');
  });

  it('trocar a sessão limpa a faixa de resultado', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'invalid' });
    renderAt('/door');
    await screen.findByRole('option', { name: /Duna/ });

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: duna.id } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'lixo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByRole('status')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: oppenheimer.id } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('filtro que esconde a sessão escolhida limpa seleção e faixa', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'invalid' });
    renderAt('/door');
    await screen.findByRole('option', { name: /Duna/ });

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: duna.id } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'lixo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByRole('status')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oppen' } });
    expect((screen.getByLabelText('Sessão') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Validar' })).toHaveProperty('disabled', true);
  });

  it('falha de rede não mistura com os quatro resultados', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockRejectedValue(new ApiError('boom', 500));
    renderAt('/door');
    await screen.findByRole('option', { name: /Duna/ });

    fireEvent.change(screen.getByLabelText('Sessão'), { target: { value: duna.id } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ticket.sig' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Não foi possível validar o ingresso')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
