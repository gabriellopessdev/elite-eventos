import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CinemaStage } from '../cinema';
import { EmptyNotice, ErrorNotice } from '../chrome/states';
import { pill, skeleton, surface } from '../ui';
import { ChevronIcon } from '../icons';
import { formatPrice, listEvents, posterUrl, type EventSummary } from './api';

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const longDay = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortTime = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' });

/** "Hoje · segunda, 17 de agosto" — a data absoluta continua ali para quem confere. */
function dayLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const key = dayKey(date);
  const long = longDay.format(date);

  if (key === dayKey(today)) return `Hoje · ${long}`;
  if (key === dayKey(tomorrow)) return `Amanhã · ${long}`;
  return long;
}

type Day = { key: string; label: string; events: EventSummary[] };

/** Agrupa por dia na ordem em que as sessões acontecem. */
function toDays(events: EventSummary[]): Day[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );

  const days = new Map<string, Day>();
  for (const event of sorted) {
    const date = new Date(event.startsAt);
    const key = dayKey(date);
    const day = days.get(key);
    if (day) {
      day.events.push(event);
      continue;
    }
    days.set(key, { key, label: dayLabel(date), events: [event] });
  }
  return [...days.values()];
}

function RowsSkeleton() {
  return (
    <div className="grid w-full max-w-4xl gap-2" aria-label="Carregando sessões">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`${surface} grid grid-cols-[2.75rem_1fr] items-center gap-4 p-3`}
          aria-hidden="true"
        >
          <div className={`${skeleton} aspect-2/3 w-full`} />
          <div className="grid gap-2">
            <div className={`${skeleton} h-4 w-2/5`} />
            <div className={`${skeleton} h-3 w-1/4`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionRow({ event }: { event: EventSummary }) {
  const poster = posterUrl(event.posterPath, 'w185');
  const when = new Date(event.startsAt);

  return (
    <Link
      to={`/events/${event.id}`}
      className={`${surface} grid grid-cols-[2.75rem_1fr_auto] items-center gap-4 p-3 hover:border-line-strong hover:bg-surface-high md:grid-cols-[4rem_2.75rem_1fr_7rem_auto] md:px-5`}
    >
      <span className="hidden text-xl font-extrabold tabular-nums md:block">
        {shortTime.format(when)}
      </span>

      {poster ? (
        <img src={poster} alt="" className="aspect-2/3 w-full rounded-lg object-cover" />
      ) : (
        <span className="block aspect-2/3 w-full rounded-lg bg-surface-high" aria-hidden="true" />
      )}

      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-lg font-bold tracking-tight">{event.title}</span>
        <span className="text-[13px] text-faint tabular-nums md:hidden">
          {shortTime.format(when)}
        </span>
      </span>

      <span className="text-lg font-bold tabular-nums md:text-right">
        {formatPrice(event.priceCents)}
      </span>

      <span className="hidden items-center gap-1.5 text-sm font-bold text-lavender md:flex">
        Escolher lugares
        <ChevronIcon size={18} />
      </span>
    </Link>
  );
}

export function EventsPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setEvents(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listEvents()
      .then((next) => {
        if (!cancelled) setEvents(next);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar as sessões');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const days = events ? toDays(events) : [];

  return (
    <CinemaStage
      contentClassName={
        events && events.length > 0 ? 'items-start justify-center' : 'items-center justify-center'
      }
    >
      {error ? (
        <div className="w-full max-w-md">
          <ErrorNotice message={error} onRetry={retry} />
        </div>
      ) : null}

      {events === null && !error ? <RowsSkeleton /> : null}

      {events?.length === 0 ? (
        <div className="w-full max-w-md">
          <EmptyNotice
            title="O cartaz abre em breve"
            description="Nenhuma sessão publicada por enquanto. Volte mais tarde."
          />
        </div>
      ) : null}

      {days.length > 0 ? (
        <div className="grid w-full max-w-4xl gap-7">
          <header className="grid gap-2">
            <span className={`${pill} justify-self-start`}>Em cartaz</span>
            <h1 className="m-0 text-[clamp(1.9rem,5vw,2.6rem)] font-extrabold tracking-tight">
              Próximas sessões
            </h1>
          </header>

          {days.map((day) => (
            <section key={day.key} className="grid gap-2.5">
              <h2 className="m-0 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
                {day.label}
              </h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {day.events.map((event) => (
                  <li key={event.id}>
                    <SessionRow event={event} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </CinemaStage>
  );
}
