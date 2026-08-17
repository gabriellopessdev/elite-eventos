import { useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import { formatSessionWhen, type Ticket } from '../events/api';
import { marqueeGlow } from '../ui';

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

function TicketQr({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(code, { margin: 1, width: 112 })
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
      <div
        className="size-28 rounded-md bg-white/15"
        aria-hidden="true"
        data-testid="qr-placeholder"
      />
    );
  }

  return (
    <img
      src={src}
      alt={`QR do ingresso ${code}`}
      className="size-28 rounded-md bg-white p-0.5"
      width={112}
      height={112}
    />
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
    <div className="grid gap-2" role="list">
      {nights.map((night) => {
        const open = openEventId === night.eventId;
        const panelId = `${baseId}-panel-${night.eventId}`;
        const triggerId = `${baseId}-trigger-${night.eventId}`;
        const count = night.tickets.length;
        const when = night.startsAt ? formatSessionWhen(night.startsAt) : null;
        const summary = when ? `${night.title} · ${when}` : night.title;

        return (
          <section
            key={night.eventId}
            role="listitem"
            className="grid gap-0 overflow-hidden rounded-2xl border border-[#c4b5ff]/80"
            style={marqueeGlow}
          >
            <h2 className="m-0">
              <button
                type="button"
                id={triggerId}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left md:px-4 md:py-3"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(night.eventId)}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight text-white md:text-base">
                  {summary}
                  <span className="font-semibold text-white/65">
                    {' '}
                    · {count} {count === 1 ? 'ingresso' : 'ingressos'}
                  </span>
                </span>
                <span className="shrink-0 text-base font-bold text-[#c4b5ff]" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
              </button>
            </h2>

            {open ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="grid gap-2 border-t border-white/15 px-3 py-3 md:px-4"
              >
                <ul className="m-0 grid list-none gap-2 p-0">
                  {night.tickets.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-white/20 bg-black/25 px-3 py-2.5 text-left"
                    >
                      <TicketQr code={ticket.code} />
                      <div className="grid gap-0.5">
                        <p className="m-0 text-base font-extrabold text-white">
                          Assento {ticket.seat ? `${ticket.seat.row}${ticket.seat.number}` : '—'}
                        </p>
                        <p className="m-0 text-xs font-semibold text-white/75">
                          {statusLabel[ticket.status]}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
