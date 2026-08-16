import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

const orgLogin = {
  accessToken: 'access-org',
  refreshToken: 'refresh-org',
  user: {
    id: 'user-org',
    email: 'org@elite.local',
    name: 'Organizador Demo',
    role: 'ORGANIZER' as const,
  },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('login', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => orgLogin,
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('mostra form e atalhos de demo que preenchem o seed', () => {
    renderAt('/login');

    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    expect(screen.getByLabelText('Senha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cliente' }));

    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe(
      'cliente1@elite.local',
    );
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('cli12345');
  });

  it('depois do login mostra o papel que a API devolveu', async () => {
    renderAt('/login');

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'org@elite.local' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'org12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));

    const session = await screen.findByLabelText('sessão');
    expect(session.textContent).toContain('Organizador Demo');
    expect(session.textContent).toContain('Organizador');
    expect(localStorage.getItem('elite.session')).toContain('ORGANIZER');
  });

  it('credencial inválida mostra alerta e não cria sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid credentials' }),
      }),
    );

    renderAt('/login');
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'org@elite.local' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));

    expect((await screen.findByRole('alert')).textContent).toBe('E-mail ou senha inválidos');
    expect(localStorage.getItem('elite.session')).toBeNull();
  });

  it('sair limpa a sessão no header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => orgLogin,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Organizador' }));
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    await screen.findByLabelText('sessão');

    fireEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);

    expect((await screen.findAllByRole('link', { name: 'Entrar' })).length).toBeGreaterThan(0);
    expect(localStorage.getItem('elite.session')).toBeNull();
  });
});
