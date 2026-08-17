import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ApiError, checkout, formatPrice, type Seat } from './api';
import { btn, btnGhost, hintError, surface } from '../ui';
import { ClockIcon, CloseIcon } from '../icons';

export type CloseReason = 'cancel' | 'expired';

export type CheckoutModalProps = {
  open: boolean;
  seats: Seat[];
  heldUntil: string;
  priceCents: number;
  eventId: string;
  accessToken: string;
  onClose: (reason: CloseReason) => void;
  /** Checkout 201 — parent fecha modal sem DELETE e navega. */
  onSuccess: () => void;
};

const HOLD_MS = 10 * 60_000;

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
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [open, heldUntil]);

  useEffect(() => {
    if (!open) return;
    if (remainingMs(heldUntil, now) > 0) return;
    if (expiredOnceRef.current) return;
    expiredOnceRef.current = true;
    onClose('expired');
  }, [open, heldUntil, now, onClose]);

  if (!open) return null;

  const left = remainingMs(heldUntil, now);
  const countdown = formatCountdown(left);
  const total = formatPrice(priceCents * seats.length);
  const expired = left <= 0;
  const progress = Math.max(0, Math.min(100, (left / HOLD_MS) * 100));
  const seatList = seats.map((seat) => `${seat.row}${seat.number}`).join(', ');

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
      setPayError(err instanceof ApiError ? err.message : 'Não foi possível concluir o pagamento');
    } finally {
      setPaying(false);
    }
  }

  /* Portal para o body: dentro do CinemaStage (`isolate`) o z-50 ficava preso
     naquele contexto e a tab bar do mobile pintava por cima do sheet. */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="relative grid max-h-dvh w-full max-w-md gap-5 overflow-y-auto rounded-t-3xl border border-line-strong bg-surface-high px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-left shadow-elev-2 sm:rounded-2xl sm:p-6"
      >
        <span
          aria-hidden="true"
          className="mx-auto h-1 w-10 rounded-full bg-line-strong sm:hidden"
        />

        {expired ? (
          <ExpiredPanel seatList={seatList} onClose={onClose} />
        ) : (
          <>
            <button
              type="button"
              className="absolute top-4 right-4 inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:text-ink"
              aria-label="Fechar"
              onClick={() => onClose('cancel')}
            >
              <CloseIcon size={22} />
            </button>

            <div className="grid gap-1 pr-12">
              <h2 id="checkout-title" className="m-0 text-2xl font-extrabold tracking-tight">
                Confirmar compra
              </h2>
            </div>

            <div className="grid gap-2">
              <p className="m-0 flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                  <ClockIcon size={17} />
                  Seus lugares estão guardados por
                </span>
                <span className="text-lg font-extrabold text-ink tabular-nums" aria-live="polite">
                  {countdown}
                </span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <ul className="m-0 grid list-none gap-1.5 p-0">
              {seats.map((seat) => (
                <li
                  key={seat.id}
                  className={`${surface} flex items-center justify-between px-3.5 py-3`}
                >
                  <span className="font-semibold">
                    {seat.row}
                    {seat.number}
                  </span>
                  <span className="text-[13px] text-muted tabular-nums">
                    {formatPrice(priceCents)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="m-0 flex items-baseline justify-between border-t border-line pt-4 font-bold">
              <span>Total</span>
              <span className="text-2xl font-extrabold tabular-nums">{total}</span>
            </p>

            {payError ? (
              <p className={`m-0 ${hintError}`} role="alert">
                {payError}
              </p>
            ) : null}

            <div className="grid gap-2">
              <button
                type="button"
                className={`${btn} min-h-13 w-full text-base`}
                disabled={paying}
                onClick={() => void onPay()}
              >
                {paying ? 'Pagando…' : 'Pagar'}
              </button>
              <button
                type="button"
                className={`${btnGhost} w-full`}
                onClick={() => onClose('cancel')}
                disabled={paying}
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Antes o modal simplesmente sumia quando o tempo acabava — a pessoa ficava sem
 * saber se tinha comprado. Agora a expiração é uma tela com nome e saída.
 */
function ExpiredPanel({
  seatList,
  onClose,
}: {
  seatList: string;
  onClose: (reason: CloseReason) => void;
}) {
  return (
    <div className="grid justify-items-center gap-5 py-2 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-warn/20 text-warn">
        <ClockIcon size={28} />
      </span>
      <div className="grid gap-1.5">
        <h2 id="checkout-title" className="m-0 text-2xl font-extrabold tracking-tight">
          O tempo acabou
        </h2>
        <p className="m-0 max-w-[32ch] text-muted">
          {seatList ? `Os assentos ${seatList} voltaram` : 'Seus assentos voltaram'} para o mapa.
          Nada foi cobrado.
        </p>
      </div>
      <div className="grid w-full gap-2">
        <button
          type="button"
          className={`${btn} min-h-13 w-full text-base`}
          onClick={() => onClose('cancel')}
        >
          Escolher lugares de novo
        </button>
        <Link className={`${btnGhost} w-full`} to="/events">
          Voltar ao cartaz
        </Link>
      </div>
    </div>
  );
}
