import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ticket } from '../events/api';
import { badgeOk, badgeUsed, btnGhost } from '../ui';
import { CheckIcon, CloseIcon, ShareIcon } from '../icons';
import { TicketQr } from './TicketQr';
import {
  TICKET_STATUS_LABEL,
  formatTicketPin,
  seatLabel,
  shareTicketPass,
  ticketShareUrl,
} from './pass';

export type TicketPassModalProps = {
  ticket: Ticket;
  onClose: () => void;
};

/** QR (HMAC) + PIN de 6 dígitos. Overlay fecha: o passe é só leitura. */
export function TicketPassModal({ ticket, onClose }: TicketPassModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const used = ticket.status === 'USED' || ticket.status === 'EXPIRED';
  const seat = seatLabel(ticket.seat);
  const pin = formatTicketPin(ticket.pin);

  async function onShare() {
    const url = ticketShareUrl(window.location.origin, ticket.code);
    try {
      const result = await shareTicketPass(url);
      setShareHint(result === 'copied' ? 'Link copiado' : null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareHint('Não foi possível compartilhar');
    }
  }

  useEffect(() => {
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-pass-title"
        className="relative grid w-full max-w-sm justify-items-center gap-4 rounded-t-3xl border border-line-strong bg-surface-high px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-elev-2 sm:rounded-2xl sm:pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          aria-hidden="true"
          className="mx-auto h-1 w-10 rounded-full bg-line-strong sm:hidden"
        />

        <button
          ref={closeRef}
          type="button"
          className="absolute top-4 right-4 inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:text-ink"
          aria-label="Fechar"
          onClick={onClose}
        >
          <CloseIcon size={22} />
        </button>

        <div className="grid justify-items-center gap-1 pt-8">
          <h2 id="ticket-pass-title" className="m-0 text-2xl font-extrabold tracking-tight">
            Assento {seat}
          </h2>
          <span className={used ? badgeUsed : badgeOk}>
            {used ? null : <CheckIcon size={14} strokeWidth={2.5} />}
            {TICKET_STATUS_LABEL[ticket.status]}
          </span>
        </div>

        <TicketQr code={ticket.code} used={used} />

        <p className="m-0 max-w-full text-center font-mono text-[2.15rem] leading-none font-extrabold tracking-[0.18em] text-ink select-all tabular-nums">
          {pin}
        </p>
        <p className="m-0 text-center text-[13px] text-faint">Mostre o QR ou dite os 6 dígitos</p>
        <button
          type="button"
          className={`${btnGhost} min-h-11 w-full`}
          onClick={() => void onShare()}
        >
          <ShareIcon size={18} />
          Compartilhar
        </button>
        {shareHint ? <p className="m-0 text-center text-[13px] text-faint">{shareHint}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
