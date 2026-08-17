import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import type { Role } from './auth/auth';

function renderHome() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
}

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

function labels(name: string) {
  return screen.queryAllByRole('link', { name }).map((el) => el.getAttribute('href'));
}

describe('App shell', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('visitante vê Eventos e Entrar', () => {
    renderHome();
    expect(screen.getAllByText('Elite Eventos').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'O cartaz abre em breve' })).toBeTruthy();
    expect(labels('Eventos').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Entrar/ }).length).toBeGreaterThan(0);
    expect(labels('Ingressos')).toHaveLength(0);
    expect(labels('Portaria')).toHaveLength(0);
    expect(labels('Nova sessão')).toHaveLength(0);
    expect(labels('Validar')).toHaveLength(0);
  });

  it('cliente vê Eventos e Ingressos', () => {
    seedRole('CUSTOMER', 'Cliente Um');
    renderHome();
    expect(labels('Eventos').length).toBeGreaterThan(0);
    expect(labels('Ingressos').length).toBeGreaterThan(0);
    expect(labels('Nova sessão')).toHaveLength(0);
    expect(labels('Validar')).toHaveLength(0);
  });

  it('organizador vê Nova sessão no cartaz e Publicar no formulário', () => {
    seedRole('ORGANIZER', 'Organizador Demo');
    renderHome();
    expect(labels('Eventos').length).toBeGreaterThan(0);
    expect(labels('Nova sessão').length).toBeGreaterThan(0);
    expect(labels('Ingressos')).toHaveLength(0);
  });

  it('portaria vê só Validar', () => {
    seedRole('DOOR', 'Portaria Demo');
    renderHome();
    expect(labels('Validar').length).toBeGreaterThan(0);
    expect(labels('Eventos')).toHaveLength(0);
    expect(labels('Ingressos')).toHaveLength(0);
    expect(labels('Nova sessão')).toHaveLength(0);
  });
});
