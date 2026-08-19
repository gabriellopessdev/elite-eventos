import { useId, useState } from 'react';
import { formatSessionWhen, posterUrl, type Ticket } from '../events/api';
import { badgeOk, badgeUsed, surface, surfaceHigh } from '../ui';
import { CheckIcon, ChevronIcon } from '../icons';
import { TicketPassModal } from './TicketPassModal';

const statusLabel: Record<Ticket['status'], string> = {
  UNUSED: 'Não usado',
  USED: 'Usado',
  EXPIRED: 'Expirado',
};

type SessionNight = {
  eventId: string;
  title: string;
  startsAt: string;
  posterPath: string | null;
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
      posterPath: ticket.event?.posterPath ?? null,
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

export type TicketStubbookProps = {
  tickets: Ticket[];
  /** Abre esta sessão no mount (ex. pós-checkout). */
  defaultExpandedEventId?: string;
};

/**
 * Carteira: resumo por sessão; toque no ingresso abre o passe (QR + PIN).
 */
export function TicketStubbook({ tickets, defaultExpandedEventId }: TicketStubbookProps) {
  const baseId = useId();
  const nights = toSessionNights(tickets);
  const [openEventId, setOpenEventId] = useState<string | null>(() =>
    pickInitialOpen(nights, defaultExpandedEventId),
  );
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);

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
        const poster = posterUrl(night.posterPath, 'w185');

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
                className="grid min-h-14 w-full cursor-pointer grid-cols-[2.75rem_1fr_auto] items-center gap-3 border-0 bg-transparent px-4 py-3 text-left"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(night.eventId)}
              >
                {poster ? (
                  <img src={poster} alt="" className="aspect-2/3 w-full rounded-lg object-cover" />
                ) : (
                  <span
                    data-testid="poster-placeholder"
                    className="block aspect-2/3 w-full rounded-lg bg-surface-high"
                    aria-hidden="true"
                  />
                )}
                <span className="grid min-w-0 gap-0.5">
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
                    const used = ticket.status === 'USED' || ticket.status === 'EXPIRED';
                    return (
                      <li key={ticket.id}>
                        <button
                          type="button"
                          className={`grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-line bg-surface px-3 py-3 text-left ${
                            used ? 'opacity-70' : ''
                          }`}
                          onClick={() => setOpenTicket(ticket)}
                        >
                          <span className="grid justify-items-start gap-1.5">
                            <span className="text-xl font-extrabold text-ink">
                              Assento{' '}
                              {ticket.seat ? `${ticket.seat.row}${ticket.seat.number}` : '—'}
                            </span>
                            <span className={used ? badgeUsed : badgeOk}>
                              {used ? null : <CheckIcon size={14} strokeWidth={2.5} />}
                              {statusLabel[ticket.status]}
                            </span>
                          </span>
                          <ChevronIcon size={18} className="shrink-0 text-faint" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}

      {openTicket ? (
        <TicketPassModal ticket={openTicket} onClose={() => setOpenTicket(null)} />
      ) : null}
    </div>
  );
}
