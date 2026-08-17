import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import { formatSessionWhen, type Ticket } from '../events/api';
import { badgeOk, badgeUsed, skeleton, surface, surfaceHigh } from '../ui';
import { CheckIcon, ChevronIcon } from '../icons';

const statusLabel: Record<Ticket['status'], string> = {
  UNUSED: 'Não usado',
  USED: 'Usado',
};

type SessionNight = {
  eventId: string;
  title: string;
  startsAt: string;
  tickets: Ticket[];
};

/** Agrupa flat da API em noites/sessões. */
function toSessionNights(tickets: Ticket[]): SessionNight[] {
  const groups = new Map<string, SessionNight>();
  for (const ticket of tickets) {
    const existing = groups.get(ticket.eventId);
    if (existing) {
      existing.tickets.push(ticket);
      continue;
    }
    groups.set(ticket.eventId, {
      eventId: ticket.eventId,
      title: ticket.event?.title ?? 'Sessão',
      startsAt: ticket.event?.startsAt ?? '',
      tickets: [ticket],
    });
  }
  return [...groups.values()];
}

function pickInitialOpen(nights: SessionNight[], preferred?: string): string | null {
  if (preferred && nights.some((n) => n.eventId === preferred)) return preferred;
  const withUnused = nights.find((n) => n.tickets.some((t) => t.status === 'UNUSED'));
  return withUnused?.eventId ?? nights[0]?.eventId ?? null;
}

function TicketQr({ code, used }: { code: string; used: boolean }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(code, { margin: 1, width: 176 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!src) {
    return (
      <div className={`${skeleton} size-22`} aria-hidden="true" data-testid="qr-placeholder" />
    );
  }

  return (
    <div className="relative flex">
      <img
        src={src}
        alt={`QR do ingresso ${code}`}
        className="size-22 rounded-md bg-white p-1"
        width={88}
        height={88}
      />
      {/* Usado: o QR fica velado, para ninguém tentar ler de novo na fila. */}
      {used ? <div className="absolute inset-0 rounded-md bg-surface-high/65" /> : null}
    </div>
  );
}

export type TicketStubbookProps = {
  tickets: Ticket[];
  /** Abre esta sessão no mount (ex. pós-checkout). */
  defaultExpandedEventId?: string;
};

/**
 * Carteira de ingressos: resumo por sessão; uma aberta por vez revela QRs.
 */
export function TicketStubbook({ tickets, defaultExpandedEventId }: TicketStubbookProps) {
  const baseId = useId();
  const nights = toSessionNights(tickets);
  const [openEventId, setOpenEventId] = useState<string | null>(() =>
    pickInitialOpen(nights, defaultExpandedEventId),
  );

  function toggle(eventId: string) {
    setOpenEventId((current) => (current === eventId ? null : eventId));
  }

  return (
    <div className="grid gap-2.5" role="list">
      {nights.map((night) => {
        const open = openEventId === night.eventId;
        const panelId = `${baseId}-panel-${night.eventId}`;
        const triggerId = `${baseId}-trigger-${night.eventId}`;
        const count = night.tickets.length;
        const when = night.startsAt ? formatSessionWhen(night.startsAt) : null;

        return (
          <section
            key={night.eventId}
            role="listitem"
            className={`${open ? surfaceHigh : surface} grid gap-0 overflow-hidden`}
          >
            <h2 className="m-0">
              <button
                type="button"
                id={triggerId}
                className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-3 text-left"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(night.eventId)}
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-bold tracking-tight text-ink">{night.title}</span>
                  <span className="truncate text-[13px] text-faint">
                    {when ? `${when} · ` : ''}
                    {count} {count === 1 ? 'ingresso' : 'ingressos'}
                  </span>
                </span>
                <ChevronIcon
                  size={20}
                  className={`shrink-0 ${open ? 'rotate-90 text-lavender' : 'text-faint'}`}
                />
              </button>
            </h2>

            {open ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="grid gap-2 border-t border-line px-3 py-3 md:px-4"
              >
                <ul className="m-0 grid list-none gap-2 p-0">
                  {night.tickets.map((ticket) => {
                    const used = ticket.status === 'USED';
                    return (
                      <li
                        key={ticket.id}
                        className={`grid grid-cols-[auto_1fr] items-center gap-4 rounded-xl border border-line bg-surface px-3 py-3 text-left ${
                          used ? 'opacity-70' : ''
                        }`}
                      >
                        <TicketQr code={ticket.code} used={used} />
                        <div className="grid justify-items-start gap-1.5">
                          <p className="m-0 text-xl font-extrabold text-ink">
                            Assento {ticket.seat ? `${ticket.seat.row}${ticket.seat.number}` : '—'}
                          </p>
                          <span className={used ? badgeUsed : badgeOk}>
                            {used ? null : <CheckIcon size={14} strokeWidth={2.5} />}
                            {statusLabel[ticket.status]}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
