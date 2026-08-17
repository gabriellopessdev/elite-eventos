import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CinemaStage } from '../cinema';
import { marqueeGlow, marqueePanel, marqueePill } from '../ui';
import {
  formatPrice,
  formatSessionWhen,
  getEvent,
  posterUrl,
  type EventDetail,
  type Seat,
} from './api';

const seatTone: Record<Seat['status'], string> = {
  AVAILABLE: 'bg-[#c4b5ff]',
  HELD: 'bg-white/35',
  SOLD: 'bg-black/55',
};

const seatLabel: Record<Seat['status'], string> = {
  AVAILABLE: 'disponível',
  HELD: 'reservado',
  SOLD: 'vendido',
};

function seatsByRow(seats: Seat[]) {
  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const row = rows.get(seat.row) ?? [];
    row.push(seat);
    rows.set(seat.row, row);
  }
  return [...rows.entries()];
}

function SeatMap({ seats }: { seats: Seat[] }) {
  const rows = seatsByRow(seats);

  return (
    <div className="grid justify-items-center gap-4">
      <p className="m-0 w-full max-w-md rounded-full border border-white/40 py-1.5 text-center text-[11px] font-bold tracking-[0.2em] text-white/80 uppercase">
        Tela
      </p>
      <div className="w-full overflow-x-auto">
        <div className="mx-auto grid w-max gap-1.5" role="img" aria-label="Mapa de assentos">
          {rows.map(([row, cells]) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-4 text-center text-xs font-bold text-white/70">{row}</span>
              <div className="flex gap-1">
                {cells.map((seat) => (
                  <span
                    key={seat.id}
                    className={`size-6 rounded-md md:size-7 ${seatTone[seat.status]}`}
                    aria-label={`${seat.row}${seat.number} ${seatLabel[seat.status]}`}
                  />
                ))}
              </div>
              <span className="w-4 text-center text-xs font-bold text-white/70">{row}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 flex items-center gap-2 text-xs font-semibold text-white/70">
        <span className="size-3 rounded-sm bg-[#c4b5ff]" aria-hidden="true" />
        Livre
      </p>
    </div>
  );
}

export function EventPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setEvent(undefined);
    setError(null);
    getEvent(id)
      .then((next) => {
        if (!cancelled) setEvent(next);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar a sessão');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (event === undefined) {
    return (
      <CinemaStage>
        <div className={marqueePanel} style={marqueeGlow}>
          <p className="m-0 text-base text-white/80">Carregando sessão…</p>
        </div>
      </CinemaStage>
    );
  }

  if (event === null) {
    return (
      <CinemaStage>
        <div className={marqueePanel} style={marqueeGlow}>
          <p className={marqueePill}>Sessão</p>
          <h1 className="m-0 text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold tracking-tight text-white">
            Sessão não encontrada
          </h1>
          <Link className="text-sm font-bold text-white/80 hover:text-white" to="/events">
            Voltar ao cartaz
          </Link>
        </div>
      </CinemaStage>
    );
  }

  const poster = posterUrl(event.posterPath, 'w500');

  return (
    <CinemaStage contentClassName="items-start justify-center">
      <article className="mx-auto grid w-full max-w-6xl gap-8 py-2 md:grid-cols-[minmax(0,16rem)_1fr] md:items-start md:gap-10">
        <div className="grid justify-items-center gap-3 text-center md:justify-items-start md:text-left">
          {poster ? (
            <img
              src={poster}
              alt=""
              className="aspect-2/3 w-40 overflow-hidden rounded-xl border border-[#c4b5ff] object-cover md:w-full"
            />
          ) : (
            <div
              className="aspect-2/3 w-40 rounded-xl border border-[#c4b5ff] bg-[#1c1048] md:w-full"
              aria-hidden="true"
            />
          )}
          <p className={marqueePill}>Em cartaz</p>
          <h1 className="m-0 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {event.title}
          </h1>
          <p className="m-0 text-sm text-white/75">{formatSessionWhen(event.startsAt)}</p>
          <p className="m-0 text-lg font-extrabold text-white">{formatPrice(event.priceCents)}</p>
          <Link className="text-sm font-bold text-white/80 hover:text-white" to="/events">
            Voltar ao cartaz
          </Link>
        </div>
        <SeatMap seats={event.seats} />
      </article>
    </CinemaStage>
  );
}
