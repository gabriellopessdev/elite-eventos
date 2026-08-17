import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { EmptyNotice, ErrorNotice } from '../chrome/states';
import { listMyTickets, type Ticket } from '../events/api';
import { btn, skeleton, surface } from '../ui';
import { TicketStubbook } from './TicketStubbook';

function TicketsSkeleton() {
  return (
    <div className="grid gap-2.5" aria-label="Carregando ingressos">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${surface} grid gap-2 p-4`} aria-hidden="true">
          <div className={`${skeleton} h-4 w-1/2`} />
          <div className={`${skeleton} h-3 w-1/3`} />
        </div>
      ))}
    </div>
  );
}

export function TicketsPage() {
  const { session } = useAuth();
  const role = session?.user.role;
  const accessToken = session?.accessToken;

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setTickets(null);
    setAttempt((n) => n + 1);
  }, []);

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
  }, [role, accessToken, attempt]);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      {role === 'CUSTOMER' && tickets && tickets.length > 0 ? (
        <h1 className="m-0 text-[clamp(1.8rem,5vw,2.5rem)] font-extrabold tracking-tight">
          Meus ingressos
        </h1>
      ) : null}

      {role !== 'CUSTOMER' ? (
        <EmptyNotice
          title="Meus ingressos"
          description="Entre como cliente para ver seus ingressos."
        >
          {!session ? (
            <Link className={btn} to="/login">
              Entrar
            </Link>
          ) : null}
        </EmptyNotice>
      ) : error ? (
        <ErrorNotice message={error} onRetry={retry} />
      ) : tickets === null ? (
        <TicketsSkeleton />
      ) : tickets.length === 0 ? (
        <EmptyNotice
          title="Meus ingressos"
          description="Você ainda não tem ingressos. Escolha uma sessão no cartaz."
        >
          <Link className={btn} to="/events">
            Ver cartaz
          </Link>
        </EmptyNotice>
      ) : (
        <TicketStubbook tickets={tickets} />
      )}
    </div>
  );
}
