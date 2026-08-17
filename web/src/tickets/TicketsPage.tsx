import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CinemaStage } from '../cinema';
import { formatSessionWhen, listMyTickets, type Ticket } from '../events/api';
import { btnMarquee, marqueeGlow, marqueePanel, marqueePill } from '../ui';

const statusLabel: Record<Ticket['status'], string> = {
  UNUSED: 'Não usado',
  USED: 'Usado',
};

type TicketGroup = {
  eventId: string;
  title: string;
  startsAt: string;
  tickets: Ticket[];
};

export function groupTicketsByEvent(tickets: Ticket[]): TicketGroup[] {
  const groups = new Map<string, TicketGroup>();
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

function TicketQr({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(code, { margin: 1, width: 168 })
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
        className="size-[168px] rounded-lg bg-white/15"
        aria-hidden="true"
        data-testid="qr-placeholder"
      />
    );
  }

  return (
    <img
      src={src}
      alt={`QR do ingresso ${code}`}
      className="size-[168px] rounded-lg bg-white p-1"
      width={168}
      height={168}
    />
  );
}

export function TicketsPage() {
  const { session } = useAuth();
  const role = session?.user.role;
  const accessToken = session?.accessToken;

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'CUSTOMER' || !accessToken) {
      setTickets(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    listMyTickets(accessToken)
      .then((next) => {
        if (!cancelled) setTickets(next);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os ingressos');
      });

    return () => {
      cancelled = true;
    };
  }, [role, accessToken]);

  if (role !== 'CUSTOMER') {
    return (
      <CinemaStage>
        <div className={marqueePanel} style={marqueeGlow}>
          <p className={marqueePill}>Ingressos</p>
          <h1 className="m-0 max-w-[16ch] text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold tracking-tight text-white">
            Meus ingressos
          </h1>
          <p className="m-0 max-w-md text-base text-white/80">
            Entre como cliente para ver seus ingressos.
          </p>
          {!session ? (
            <Link className={btnMarquee} to="/login">
              Entrar
            </Link>
          ) : null}
        </div>
      </CinemaStage>
    );
  }

  if (error) {
    return (
      <CinemaStage>
        <div className={marqueePanel} style={marqueeGlow}>
          <p className="m-0 text-base text-white" role="alert">
            {error}
          </p>
        </div>
      </CinemaStage>
    );
  }

  if (tickets === null) {
    return (
      <CinemaStage>
        <div className={marqueePanel} style={marqueeGlow}>
          <p className="m-0 text-base text-white/80">Carregando ingressos…</p>
        </div>
      </CinemaStage>
    );
  }

  if (tickets.length === 0) {
    return (
      <CinemaStage>
        <div className={marqueePanel} style={marqueeGlow}>
          <p className={marqueePill}>Ingressos</p>
          <h1 className="m-0 max-w-[14ch] text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold tracking-tight text-white">
            Meus ingressos
          </h1>
          <p className="m-0 max-w-md text-base text-white/80">
            Você ainda não tem ingressos. Escolha uma sessão no cartaz.
          </p>
          <Link className={btnMarquee} to="/events">
            Ver cartaz
          </Link>
        </div>
      </CinemaStage>
    );
  }

  const groups = groupTicketsByEvent(tickets);

  return (
    <CinemaStage contentClassName="items-start justify-center">
      <div className="mx-auto grid w-full max-w-3xl gap-8 py-2">
        <header className="grid justify-items-center gap-2 text-center">
          <p className={marqueePill}>Ingressos</p>
          <h1 className="m-0 text-[clamp(2.1rem,6vw,3.2rem)] font-extrabold tracking-tight text-white">
            Meus ingressos
          </h1>
        </header>

        {groups.map((group) => (
          <section
            key={group.eventId}
            className="grid gap-4 rounded-[1.75rem] border border-[#c4b5ff] px-5 py-6 md:px-8 md:py-8"
            style={marqueeGlow}
            aria-labelledby={`tickets-${group.eventId}`}
          >
            <h2
              id={`tickets-${group.eventId}`}
              className="m-0 text-xl font-extrabold tracking-tight text-white md:text-2xl"
            >
              {group.title}
              {group.startsAt ? ` · ${formatSessionWhen(group.startsAt)}` : ''}
            </h2>

            <ul className="m-0 grid list-none gap-4 p-0">
              {group.tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="grid justify-items-center gap-3 rounded-2xl border border-white/25 bg-black/25 px-4 py-5 text-center sm:grid-cols-[auto_1fr] sm:items-center sm:justify-items-start sm:text-left"
                >
                  <TicketQr code={ticket.code} />
                  <div className="grid gap-1">
                    <p className="m-0 text-lg font-extrabold text-white">
                      Assento {ticket.seat ? `${ticket.seat.row}${ticket.seat.number}` : '—'}
                    </p>
                    <p className="m-0 text-sm font-semibold text-white/75">
                      {statusLabel[ticket.status]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CinemaStage>
  );
}
