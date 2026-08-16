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

function stubApi(loginBody: object = orgLogin, loginOk = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/auth/login') && method === 'POST') {
        return {
          ok: loginOk,
          status: loginOk ? 200 : 401,
          json: async () => loginBody,
        };
      }
      if (url.includes('/events')) {
        return { ok: true, json: async () => ({ events: [] }) };
      }
      if (url.includes('/auth/logout')) {
        return { ok: true, status: 204 };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

describe('login', () => {
  beforeEach(() => {
    localStorage.clear();
    stubApi();
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
    stubApi({ message: 'Invalid credentials' }, false);

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
    stubApi();

    renderAt('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Organizador' }));
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    await screen.findByLabelText('sessão');

    fireEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]);

    expect((await screen.findAllByRole('link', { name: 'Entrar' })).length).toBeGreaterThan(0);
    expect(localStorage.getItem('elite.session')).toBeNull();
  });
});
