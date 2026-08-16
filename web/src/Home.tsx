import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { btn } from './ui';
import { useAuth } from './auth/useAuth';
import { formatPrice, formatSessionWhen, posterUrl, type EventSummary } from './events/api';
import { SessionCard } from './events/SessionCard';
import { useEventCatalog } from './events/useEventCatalog';

const MARQUEE_GRADIENT =
  'radial-gradient(ellipse 90% 70% at 10% 100%, rgb(105 101 219 / 0.55), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 0%, rgb(241 240 255 / 0.22), transparent 50%), linear-gradient(160deg, #190064 0%, #4a47b1 52%, #6965db 100%)';

export function Home() {
  const { events, error, loading } = useEventCatalog();
  const featured = events?.[0];
  const rest = events?.slice(1) ?? [];

  return (
    <div>
      {loading ? <ClosedMarquee title="Cartaz…" /> : null}

      {error ? (
        <ClosedMarquee title="O cartaz abre em breve">
          <p className="m-0 text-sm text-white/80" role="alert">
            {error}
          </p>
        </ClosedMarquee>
      ) : null}

      {featured ? <Billboard event={featured} /> : null}

      {events?.length === 0 && !error ? (
        <ClosedMarquee title="O cartaz abre em breve" showEnter />
      ) : null}

      {rest.length > 0 ? (
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:px-6">
          <h2 className="m-0 text-xl font-extrabold text-brand">Também no cartaz</h2>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((event) => (
              <li key={event.id}>
                <SessionCard event={event} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClosedMarquee({
  title,
  showEnter = false,
  children,
}: {
  title: string;
  showEnter?: boolean;
  children?: ReactNode;
}) {
  const { session } = useAuth();

  return (
    <section className="relative isolate flex min-h-[calc(100dvh-5.5rem)] flex-col justify-end overflow-hidden px-6 py-10 md:min-h-[calc(100dvh-6.5rem)] md:px-14 md:py-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: MARQUEE_GRADIENT }}
      />
      <div className="relative mx-auto grid w-full max-w-3xl justify-items-center gap-4 text-center">
        <p className="m-0 w-fit rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-widest text-white/80 uppercase">
          Em cartaz
        </p>
        <h1 className="m-0 text-[clamp(2.4rem,7vw,4.5rem)] font-extrabold tracking-tight text-white md:leading-[0.95]">
          {title}
        </h1>
        {children}
        {showEnter && !session ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-3 font-extrabold text-brand hover:bg-surface-high"
            to="/login"
          >
            Entrar
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Billboard({ event }: { event: EventSummary }) {
  const poster = posterUrl(event.posterPath, 'w780');

  return (
    <section className="relative isolate flex min-h-[calc(100dvh-5.5rem)] flex-col justify-end overflow-hidden md:min-h-[calc(100dvh-6.5rem)]">
      {poster ? (
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: MARQUEE_GRADIENT }}
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-brand via-brand/55 to-transparent" />
      <div className="relative grid max-w-3xl gap-3 px-6 py-10 md:px-14 md:py-16">
        <p className="m-0 w-fit rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-widest text-white/80 uppercase">
          Em cartaz
        </p>
        <h1 className="m-0 text-[clamp(2.2rem,6vw,4rem)] font-extrabold tracking-tight text-white">
          {event.title}
        </h1>
        <p className="m-0 text-base text-white/80 md:text-lg">
          {formatSessionWhen(event.startsAt)} · {formatPrice(event.priceCents)}
        </p>
        <Link className={`${btn} w-fit px-5`} to={`/events/${event.id}`}>
          Comprar ingresso
        </Link>
      </div>
    </section>
  );
}
