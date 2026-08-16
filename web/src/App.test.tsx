import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

describe('App shell', () => {
  it('renderiza marca e CTA', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Elite Eventos')).toBeTruthy();
    expect(screen.getByText('Ver eventos')).toBeTruthy();
  });
});
