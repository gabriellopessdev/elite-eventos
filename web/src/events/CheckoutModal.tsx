import { useEffect, useRef, useState } from 'react';
import { ApiError, checkout, formatPrice, type Seat } from './api';
import { btn, btnGhost } from '../ui';

export type CheckoutModalProps = {
  open: boolean;
  seats: Seat[];
  heldUntil: string;
  priceCents: number;
  eventId: string;
  accessToken: string;
  onClose: () => void;
  /** Checkout 201 — parent fecha modal sem DELETE e navega. */
  onSuccess: () => void;
};

function remainingMs(heldUntil: string, now: number) {
  return new Date(heldUntil).getTime() - now;
}

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CheckoutModal({
  open,
  seats,
  heldUntil,
  priceCents,
  eventId,
  accessToken,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const [now, setNow] = useState(() => Date.now());
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const expiredOnceRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    expiredOnceRef.current = false;
    setPayError(null);
    setPaying(false);
    setNow(Date.now());

    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [open, heldUntil]);

  useEffect(() => {
    if (!open) return;
    if (remainingMs(heldUntil, now) > 0) return;
    if (expiredOnceRef.current) return;
    expiredOnceRef.current = true;
    onClose();
  }, [open, heldUntil, now, onClose]);

  if (!open) return null;

  const left = remainingMs(heldUntil, now);
  const countdown = formatCountdown(left);
  const total = formatPrice(priceCents * seats.length);
  const expired = left <= 0;

  async function onPay() {
    if (paying || expired) return;
    setPayError(null);
    setPaying(true);
    try {
      await checkout(eventId, accessToken);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setPayError(err.message);
        return;
      }
      setPayError(
        err instanceof ApiError ? err.message : 'Não foi possível concluir o pagamento',
      );
    } finally {
      setPaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="relative grid w-full max-w-md gap-4 rounded-2xl border border-[#c4b5ff]/60 bg-[#1c1048] p-6 text-left shadow-[0_0_48px_rgb(105_101_219/0.45)]"
      >
        <button
          type="button"
          className="absolute top-3 right-3 inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-white/10 text-lg font-bold text-white/80 hover:bg-white/20 hover:text-white"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>

        <div className="grid gap-1 pr-8">
          <h2 id="checkout-title" className="m-0 text-xl font-extrabold text-white">
            Checkout
          </h2>
          <p className="m-0 text-sm text-white/70">
            Reserva expira em{' '}
            <span className="font-extrabold text-white tabular-nums" aria-live="polite">
              {countdown}
            </span>
          </p>
        </div>

        <ul className="m-0 grid list-none gap-1.5 p-0 text-sm text-white/85">
          {seats.map((seat) => (
            <li
              key={seat.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="font-semibold">
                {seat.row}
                {seat.number}
              </span>
              <span className="text-white/70">{formatPrice(priceCents)}</span>
            </li>
          ))}
        </ul>

        <p className="m-0 flex items-baseline justify-between text-base font-extrabold text-white">
          <span>Total</span>
          <span>{total}</span>
        </p>

        {payError ? (
          <p className="m-0 text-sm font-semibold text-[#ffb4b4]" role="alert">
            {payError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            className={`${btn} w-full sm:w-auto`}
            disabled={paying || expired}
            onClick={() => void onPay()}
          >
            {paying ? 'Pagando…' : 'Pagar'}
          </button>
          <button
            type="button"
            className={`${btnGhost} w-full border-white/20 bg-white/5 text-white sm:w-auto`}
            onClick={onClose}
            disabled={paying}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
