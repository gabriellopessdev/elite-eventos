import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    vi.useRealTimers();
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
    expect(await screen.findByRole('button', { name: /Duna/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Oppenheimer/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oppen' } });
    expect(screen.getByRole('button', { name: /Oppenheimer/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Duna/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: sessionDay(duna.startsAt) },
    });
    expect(screen.getByRole('button', { name: /Duna/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Oppenheimer/ })).toBeNull();
  });

  it('sem sessão escolhida não há leitor nem campo de código', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    renderAt('/door');

    await screen.findByRole('button', { name: /Duna/ });

    // Validar só existe dentro do modal, que só abre por uma sessão.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();
  });

  it('abre o modal na sessão tocada e fecha pelo Fechar', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Duna' })).toBeTruthy();
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();

    // O botão troca o leitor pelo campo, e volta.
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    expect(screen.getByLabelText('Código de 6 dígitos')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Validar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Usar a câmera' }));
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cola o código e mostra Válido com o assento', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    const scan = vi.spyOn(api, 'scanEvent').mockResolvedValue({
      outcome: 'valid',
      seat: { row: 'B', number: 7 },
    });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '384291' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect((await screen.findByRole('status')).textContent).toBe('Válido · B7');
    expect(scan).toHaveBeenCalledWith(duna.id, '384291', 'access-DOOR');
    expect((screen.getByLabelText('Código de 6 dígitos') as HTMLInputElement).value).toBe('');
  });

  it('ingresso de outra sessão mostra Sessão errada', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'wrong_event' });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '555111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect((await screen.findByRole('status')).textContent).toBe('Sessão errada');
  });

  it('mostra Ingresso inválido e Já utilizado', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    const scan = vi.spyOn(api, 'scanEvent').mockResolvedValueOnce({ outcome: 'invalid' });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('status')).textContent).toBe('Ingresso inválido');

    scan.mockResolvedValueOnce({ outcome: 'used' });
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '102938' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('status')).textContent).toBe('Já utilizado');
  });

  it('ingresso expirado mostra Expirado', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'expired' });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '384291' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect((await screen.findByRole('status')).textContent).toBe('Expirado');
  });

  it('trocar a sessão limpa a faixa de resultado', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'invalid' });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByRole('status')).toBeTruthy();

    // Fechar e abrir outra sessão começa do zero.
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(screen.getByRole('button', { name: /Oppenheimer/ }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('filtro que esconde a sessão escolhida limpa seleção e faixa', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockResolvedValue({ outcome: 'invalid' });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByRole('status')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oppen' } });
    // A sessão aberta saiu do filtro: o modal fecha junto com o resultado.
    expect(screen.queryByRole('button', { name: /Duna/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();
  });

  it('ignora o mesmo código por 2s após validar', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    const scan = vi.spyOn(api, 'scanEvent').mockResolvedValue({
      outcome: 'valid',
      seat: { row: 'B', number: 7 },
    });
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '384291' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('status').textContent).toBe('Válido · B7');
    expect(scan).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '384291' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(scan).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '384291' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenNthCalledWith(2, duna.id, '384291', 'access-DOOR');
  });

  it('falha de rede não mistura com os quatro resultados', async () => {
    seedRole('DOOR', 'Portaria Demo');
    vi.spyOn(api, 'listEvents').mockResolvedValue([duna, oppenheimer]);
    vi.spyOn(api, 'scanEvent').mockRejectedValue(new ApiError('boom', 500));
    renderAt('/door');
    await screen.findByRole('button', { name: /Duna/ });

    fireEvent.click(screen.getByRole('button', { name: /Duna/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Digitar o código' }));
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '384291' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Não foi possível validar o ingresso')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
