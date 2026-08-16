import { Link } from 'react-router-dom';
import { island } from '../ui';
import { formatPrice, formatSessionWhen, posterUrl, type EventSummary } from './api';

export function SessionCard({ event }: { event: EventSummary }) {
  const poster = posterUrl(event.posterPath);

  return (
    <Link
      to={`/events/${event.id}`}
      className={`${island} grid overflow-hidden transition-shadow hover:shadow-[0_8px_24px_rgb(105_101_219_/_0.16)]`}
    >
      {poster ? (
        <img src={poster} alt="" className="aspect-[2/3] w-full object-cover" />
      ) : (
        <div
          className="flex aspect-[2/3] items-end bg-gradient-to-br from-brand to-accent p-4"
          aria-hidden="true"
        />
      )}
      <div className="grid gap-1 p-4">
        <h2 className="m-0 text-lg font-extrabold text-brand">{event.title}</h2>
        <p className="m-0 text-sm text-muted">{formatSessionWhen(event.startsAt)}</p>
        <p className="m-0 text-sm font-bold text-accent">{formatPrice(event.priceCents)}</p>
      </div>
    </Link>
  );
}
