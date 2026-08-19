import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { EmptyNotice, ErrorNotice } from '../chrome/states';
import { formatSessionWhen, listMyTickets, type Ticket } from '../events/api';
import { sessionDay } from '../events/session-day';
import {
  btn,
  chipActive,
  chipIdle,
  fieldInput,
  fieldLabel,
  skeleton,
  surface,
  surfaceHigh,
} from '../ui';
import { TicketStubbook } from './TicketStubbook';

type StatusFilter = 'ALL' | Ticket['status'];

/* No plural: o chip filtra um conjunto, o badge do ingresso fala de um só. */
const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'UNUSED', label: 'Não usados' },
  { value: 'USED', label: 'Usados' },
  { value: 'EXPIRED', label: 'Expirados' },
];

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
  const [sessionFilter, setSessionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateFilter, setDateFilter] = useState('');

  /** Uma opção por sessão que a pessoa realmente tem ingresso. */
  const sessionOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const ticket of tickets ?? []) {
      if (byId.has(ticket.eventId)) continue;
      const startsAt = ticket.event?.startsAt;
      if (dateFilter && (!startsAt || sessionDay(startsAt) !== dateFilter)) continue;
      const title = ticket.event?.title ?? 'Sessão';
      const when = startsAt ? ` · ${formatSessionWhen(startsAt)}` : '';
      byId.set(ticket.eventId, `${title}${when}`);
    }
    return [...byId.entries()].map(([id, label]) => ({ id, label }));
  }, [tickets, dateFilter]);

  if (sessionFilter && !sessionOptions.some((option) => option.id === sessionFilter)) {
    setSessionFilter('');
  }

  const visible = useMemo(() => {
    return (tickets ?? []).filter((ticket) => {
      const startsAt = ticket.event?.startsAt;
      if (dateFilter && (!startsAt || sessionDay(startsAt) !== dateFilter)) return false;
      if (sessionFilter && ticket.eventId !== sessionFilter) return false;
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false;
      return true;
    });
  }, [tickets, dateFilter, sessionFilter, statusFilter]);

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
        <>
          <section className={`${surfaceHigh} grid gap-3 p-4`}>
            <h2 className="m-0 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
              Filtros
            </h2>

            <div className="grid gap-3 sm:grid-cols-4">
              <label className={`grid gap-1.5 sm:col-span-1 ${fieldLabel}`} htmlFor="ticket-date">
                Data
                <input
                  id="ticket-date"
                  type="date"
                  className={`${fieldInput} font-normal`}
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </label>

              <label
                className={`grid gap-1.5 sm:col-span-3 ${fieldLabel}`}
                htmlFor="ticket-session"
              >
                Sessão
                <select
                  id="ticket-session"
                  className={`${fieldInput} font-normal`}
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                >
                  <option value="">Todas as sessões</option>
                  {sessionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-1.5">
              <span className={fieldLabel}>Status</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
                {STATUS_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={statusFilter === option.value}
                    className={statusFilter === option.value ? chipActive : chipIdle}
                    onClick={() => setStatusFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {visible.length === 0 ? (
            <p className={`${surface} m-0 px-4 py-8 text-center text-muted`}>
              Nenhum ingresso bate com os filtros.
            </p>
          ) : (
            <TicketStubbook
              key={`${dateFilter}-${sessionFilter}-${statusFilter}`}
              tickets={visible}
              onTicketReturned={() => setAttempt((n) => n + 1)}
            />
          )}
        </>
      )}
    </div>
  );
}
