import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CinemaStage } from '../cinema';
import { marqueeGlow, marqueePanel, marqueePill } from '../ui';
import { formatPrice, formatSessionWhen, listEvents, posterUrl, type EventSummary } from './api';

export function EventsPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return (
    <CinemaStage>
      {error ? (
        <div className={marqueePanel} style={marqueeGlow}>
          <p className={marqueePill}>Em cartaz</p>
          <p className="m-0 text-base text-white" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {events === null && !error ? (
        <div className={marqueePanel} style={marqueeGlow}>
          <p className={marqueePill}>Em cartaz</p>
          <p className="m-0 text-base text-white/80">Carregando sessões…</p>
        </div>
      ) : null}

      {events?.length === 0 ? (
        <div className={marqueePanel} style={marqueeGlow}>
          <p className={marqueePill}>Em cartaz</p>
          <h1 className="m-0 max-w-[14ch] text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold tracking-tight text-white">
            O cartaz abre em breve
          </h1>
        </div>
      ) : null}

      {events && events.length > 0 ? (
        <div className="flex w-full max-w-5xl flex-col items-center gap-8">
          <p className={marqueePill}>Em cartaz</p>
          <ul className="m-0 grid w-full list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id}>
                <SessionCard event={event} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CinemaStage>
  );
}

function SessionCard({ event }: { event: EventSummary }) {
  const poster = posterUrl(event.posterPath);

  return (
    <Link
      to={`/events/${event.id}`}
      className="grid overflow-hidden rounded-[1.25rem] border border-[#c4b5ff]"
      style={marqueeGlow}
    >
      {poster ? (
        <img src={poster} alt="" className="aspect-[2/3] w-full object-cover" />
      ) : (
        <div className="aspect-[2/3] w-full bg-[#1c1048]" aria-hidden="true" />
      )}
      <div className="grid gap-1 p-4 text-left">
        <h2 className="m-0 text-lg font-extrabold text-white">{event.title}</h2>
        <p className="m-0 text-sm text-white/75">{formatSessionWhen(event.startsAt)}</p>
        <p className="m-0 text-sm font-extrabold text-white">{formatPrice(event.priceCents)}</p>
      </div>
    </Link>
  );
}
