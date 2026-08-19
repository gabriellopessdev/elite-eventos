import { Link } from 'react-router-dom';
import { formatSessionWhen, posterUrl, type Ticket } from '../events/api';
import { badgeOk, badgeUsed } from '../ui';
import { CheckIcon } from '../icons';
import { TicketQr } from './TicketQr';
import { TICKET_STATUS_LABEL, formatTicketPin, seatLabel } from './pass';

export function TicketPaper({ ticket }: { ticket: Ticket | null }) {
  const used = ticket ? ticket.status === 'USED' || ticket.status === 'EXPIRED' : false;
  const poster = ticket ? posterUrl(ticket.event?.posterPath ?? null, 'w500') : null;
  const seat = seatLabel(ticket?.seat);
  const startsAt = ticket?.event?.startsAt;

  return (
    <article className="relative w-full max-w-[24rem] overflow-hidden rounded-2xl bg-surface-high shadow-elev-2">
      <div className="relative min-h-[26rem]">
        {poster ? (
          <img src={poster} alt="" className="absolute inset-0 size-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 bg-surface-top" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/40 to-black/88" />
        <div className="relative z-10 grid justify-items-center gap-3 px-5 pt-16 pb-5">
          <Link to="/events" className="font-extrabold tracking-tight text-white hover:text-white">
            Elite Eventos
          </Link>
          {ticket ? (
            <>
              <h1 className="m-0 text-2xl font-extrabold tracking-tight text-white">
                Assento {seat}
              </h1>
              <span className={used ? badgeUsed : badgeOk}>
                {used ? null : <CheckIcon size={14} strokeWidth={2.5} />}
                {TICKET_STATUS_LABEL[ticket.status]}
              </span>
              <TicketQr code={ticket.code} used={used} />
              <p className="m-0 max-w-full text-center font-mono text-[2.15rem] leading-none font-extrabold tracking-[0.18em] text-white select-all tabular-nums">
                {formatTicketPin(ticket.pin)}
              </p>
            </>
          ) : (
            <h1 className="m-0 text-center text-2xl font-extrabold tracking-tight text-white">
              Ingresso não encontrado.
            </h1>
          )}
        </div>
      </div>

      <div className="relative bg-surface-high" aria-hidden="true">
        <span className="absolute top-1/2 left-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas" />
        <span className="absolute top-1/2 right-0 size-5 translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas" />
        <div className="mx-6 border-t border-dashed border-line-strong" />
      </div>

      <dl className="grid gap-2 px-5 py-4 text-[13px]">
        <div className="flex justify-between gap-3">
          <dt className="m-0 text-faint">Título</dt>
          <dd className="m-0 font-semibold text-ink">
            {ticket === null ? '—' : (ticket.event?.title ?? '—')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="m-0 text-faint">Sessão</dt>
          <dd className="m-0 font-semibold text-ink">
            {startsAt ? formatSessionWhen(startsAt) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="m-0 text-faint">Assento</dt>
          <dd className="m-0 font-semibold text-ink">
            {ticket === null ? '—' : `Assento ${seat}`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="m-0 text-faint">Status</dt>
          <dd className="m-0 font-semibold text-ink">
            {ticket === null ? '—' : TICKET_STATUS_LABEL[ticket.status]}
          </dd>
        </div>
      </dl>
    </article>
  );
}
