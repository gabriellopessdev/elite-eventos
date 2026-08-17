import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { CheckoutModal, type CheckoutModalProps } from './CheckoutModal';
import type { Seat } from './api';

const seats: Seat[] = [
  { id: 'seat-0', row: 'A', number: 1, status: 'HELD', heldUntil: null },
  { id: 'seat-1', row: 'A', number: 2, status: 'HELD', heldUntil: null },
];

function renderModal(props: Partial<CheckoutModalProps> & { heldUntil: string }) {
  const onClose = props.onClose ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();

  render(
    <MemoryRouter>
      <CheckoutModal
        open
        seats={seats}
        priceCents={3500}
        eventId="evt-dune"
        accessToken="access-customer"
        onClose={onClose}
        onSuccess={onSuccess}
        {...props}
      />
    </MemoryRouter>,
  );

  return { onClose, onSuccess };
}

describe('CheckoutModal', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('expira o timer e chama onClose uma vez', async () => {
    vi.useFakeTimers();
    const heldUntil = new Date(Date.now() + 3000).toISOString();
    const onClose = vi.fn();

    renderModal({ heldUntil, onClose });

    expect(screen.getByText('00:03')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('402 mostra a mensagem do servidor e mantém o modal', async () => {
    const message = 'Pagamento recusado (simulação ~25% para a demo — não é bug). Tente de novo.';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({ message }),
      }),
    );

    const heldUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const { onClose, onSuccess } = renderModal({ heldUntil });

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('201 chama onSuccess (navigate /tickets) sem onClose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ tickets: [{ id: 't1' }] }),
      }),
    );

    const heldUntil = new Date(Date.now() + 10 * 60_000).toISOString();

    function PayAndGo() {
      const navigate = useNavigate();
      return (
        <CheckoutModal
          open
          seats={seats}
          heldUntil={heldUntil}
          priceCents={3500}
          eventId="evt-dune"
          accessToken="access-customer"
          onClose={vi.fn()}
          onSuccess={() => navigate('/tickets')}
        />
      );
    }

    render(
      <MemoryRouter initialEntries={['/events/evt-dune']}>
        <Routes>
          <Route path="/events/:id" element={<PayAndGo />} />
          <Route path="/tickets" element={<h1>Meus ingressos</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeTruthy();
  });

  it('Cancelar chama onClose', () => {
    const heldUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const { onClose } = renderModal({ heldUntil });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lista assentos e total', () => {
    const heldUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    renderModal({ heldUntil });

    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('A2')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText(/70,00/)).toBeTruthy();
  });
});
