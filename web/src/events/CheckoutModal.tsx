import { formatPrice, type Seat } from './api';
import { btn, btnGhost } from '../ui';

export type CheckoutModalProps = {
  open: boolean;
  seats: Seat[];
  heldUntil: string;
  priceCents: number;
  onClose: () => void;
  /** Task 7: pagamento simulado */
  onPaid?: () => void;
};

export function CheckoutModal({
  open,
  seats,
  heldUntil,
  priceCents,
  onClose,
  onPaid: _onPaid,
}: CheckoutModalProps) {
  if (!open) return null;

  const total = formatPrice(priceCents * seats.length);
  const labels = seats.map((seat) => `${seat.row}${seat.number}`).join(', ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="grid w-full max-w-md gap-4 rounded-2xl border border-[#c4b5ff]/60 bg-[#1c1048] p-6 text-left shadow-[0_0_48px_rgb(105_101_219/0.45)]"
      >
        <div className="grid gap-1">
          <h2 id="checkout-title" className="m-0 text-xl font-extrabold text-white">
            Checkout
          </h2>
          <p className="m-0 text-sm text-white/70">
            Assentos reservados até{' '}
            {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(heldUntil))}
          </p>
        </div>

        <div className="grid gap-1 text-sm text-white/85">
          <p className="m-0 font-semibold">{labels || '—'}</p>
          <p className="m-0 text-white/70">
            {seats.length} {seats.length === 1 ? 'ingresso' : 'ingressos'} · {total}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" className={`${btn} w-full sm:w-auto`} disabled title="Em breve">
            Pagar
          </button>
          <button type="button" className={`${btnGhost} w-full border-white/20 bg-white/5 text-white sm:w-auto`} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
