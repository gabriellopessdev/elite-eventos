import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CinemaStage } from '../cinema';
import { listMyTickets, type Ticket } from '../events/api';
import { btnMarquee, marqueeGlow, marqueePanel, marqueePill } from '../ui';
import { TicketStubbook } from './TicketStubbook';

export function TicketsPage() {
  const { session } = useAuth();
  const role = session?.user.role;
  const accessToken = session?.accessToken;

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'CUSTOMER' || !accessToken) return;

    let cancelled = false;
    listMyTickets(accessToken)
      .then((next) => {
        if (!cancelled) {
          setTickets(next);
          setError(null);
        }
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

  return (
    <CinemaStage contentClassName="items-start justify-center">
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <header className="grid justify-items-center gap-1 text-center">
          <h1 className="m-0 text-[clamp(1.6rem,4.5vw,2.4rem)] font-extrabold tracking-tight text-white">
            Meus ingressos
          </h1>
        </header>

        <TicketStubbook tickets={tickets} />
      </div>
    </CinemaStage>
  );
}
