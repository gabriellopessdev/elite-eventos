import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CinemaStage } from '../cinema';
import { btnMarquee, marqueeGlow, marqueePanel, marqueePill } from '../ui';
import { CheckoutModal } from './CheckoutModal';
import {
  ApiError,
  formatPrice,
  formatSessionWhen,
  getEvent,
  holdSeats,
  posterUrl,
  releaseHold,
  saveSeatSelection,
  takeSeatSelection,
  type EventDetail,
  type Seat,
} from './api';

const MAX_SEATS = 8;

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

function mergeHeldSeats(seats: Seat[], held: Seat[]): Seat[] {
  const byId = new Map(held.map((seat) => [seat.id, seat]));
  return seats.map((seat) => {
    const next = byId.get(seat.id);
    return next ? { ...seat, ...next } : seat;
  });
}

function freeHeldSeats(seats: Seat[], seatIds: string[]): Seat[] {
  const ids = new Set(seatIds);
  return seats.map((seat) =>
    ids.has(seat.id) && seat.status === 'HELD'
      ? { ...seat, status: 'AVAILABLE' as const, heldUntil: null }
      : seat,
  );
}

type SeatMapProps = {
  seats: Seat[];
  selectedIds: Set<string>;
  onToggle: (seat: Seat) => void;
};

function SeatMap({ seats, selectedIds, onToggle }: SeatMapProps) {
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
                {cells.map((seat) => {
                  const selected = selectedIds.has(seat.id);
                  const selectable = seat.status === 'AVAILABLE';
                  const label = `${seat.row}${seat.number} ${
                    selected ? 'selecionado' : seatLabel[seat.status]
                  }`;
                  const tone = selected
                    ? 'bg-white ring-2 ring-white ring-offset-1 ring-offset-[#1c1048]'
                    : seatTone[seat.status];

                  if (!selectable) {
                    return (
                      <span
                        key={seat.id}
                        className={`size-6 rounded-md md:size-7 ${tone}`}
                        aria-label={label}
                      />
                    );
                  }

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      className={`size-6 cursor-pointer rounded-md border-0 p-0 md:size-7 ${tone}`}
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => onToggle(seat)}
                    />
                  );
                })}
              </div>
              <span className="w-4 text-center text-xs font-bold text-white/70">{row}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-white/70">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[#c4b5ff]" aria-hidden="true" />
          Livre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-3 rounded-sm bg-white ring-1 ring-white ring-offset-1 ring-offset-[#1c1048]"
            aria-hidden="true"
          />
          Selecionado
        </span>
      </p>
    </div>
  );
}

export function EventPage() {
  const { id } = useParams();
  if (!id) return null;
  return <EventSession key={id} id={id} />;
}

function EventSession({ id }: { id: string }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const accessToken = session?.accessToken ?? null;
  const role = session?.user.role;

  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setActionError(null);
    setCheckoutOpen(false);
    setHeldUntil(null);

    getEvent(id, accessToken)
      .then((next) => {
        if (cancelled) return;
        setEvent(next);
        if (!next) return;

        if (role === 'CUSTOMER') {
          const restored = takeSeatSelection(id);
          if (restored?.length) {
            const available = new Set(
              next.seats.filter((s) => s.status === 'AVAILABLE').map((s) => s.id),
            );
            setSelectedIds(restored.filter((seatId) => available.has(seatId)).slice(0, MAX_SEATS));
          } else {
            setSelectedIds([]);
          }
        } else {
          setSelectedIds([]);
        }

        if (next.myHold && role === 'CUSTOMER') {
          setSelectedIds(next.myHold.seatIds);
          setHeldUntil(next.myHold.heldUntil);
          setCheckoutOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar a sessão');
      });

    return () => {
      cancelled = true;
    };
  }, [id, accessToken, role]);

  function toggleSeat(seat: Seat) {
    if (seat.status !== 'AVAILABLE') return;
    setActionError(null);
    setSelectedIds((prev) => {
      if (prev.includes(seat.id)) return prev.filter((x) => x !== seat.id);
      if (prev.length >= MAX_SEATS) return prev;
      return [...prev, seat.id];
    });
  }

  async function onPay() {
    if (selectedIds.length < 1 || selectedIds.length > MAX_SEATS) return;
    setActionError(null);

    if (!session) {
      saveSeatSelection(id, selectedIds);
      navigate(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
      return;
    }

    if (role === 'ORGANIZER' || role === 'DOOR') {
      setActionError('Só clientes podem comprar ingressos.');
      return;
    }

    if (role !== 'CUSTOMER' || !accessToken) return;

    setPaying(true);
    try {
      const result = await holdSeats(id, selectedIds, accessToken);
      setEvent((prev) =>
        prev ? { ...prev, seats: mergeHeldSeats(prev.seats, result.seats), myHold: undefined } : prev,
      );
      setHeldUntil(result.heldUntil);
      setCheckoutOpen(true);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? err.message || 'Assentos indisponíveis'
          : 'Não foi possível reservar os assentos';
      setActionError(message);
    } finally {
      setPaying(false);
    }
  }

  async function onCheckoutClose() {
    const heldIds = selectedIds;
    setCheckoutOpen(false);
    setHeldUntil(null);
    if (accessToken && role === 'CUSTOMER') {
      try {
        await releaseHold(id, accessToken);
        setEvent((prev) =>
          prev ? { ...prev, seats: freeHeldSeats(prev.seats, heldIds), myHold: undefined } : prev,
        );
      } catch {
        setActionError('Não foi possível liberar a reserva');
      }
    }
  }

  /** Sucesso: fecha modal sem DELETE (assentos já SOLD) e vai aos ingressos. */
  function onCheckoutSuccess() {
    setCheckoutOpen(false);
    setHeldUntil(null);
    navigate('/tickets');
  }

  /**
   * Abandono SPA: não liberamos no unmount (Strict Mode).
   * Só DELETE em Cancel/timer (onClose) e ao clicar "Voltar ao cartaz" com modal aberto.
   */
  async function onBackToCartaz(e: MouseEvent<HTMLAnchorElement>) {
    if (!checkoutOpen) return;
    e.preventDefault();
    await onCheckoutClose();
    navigate('/events');
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
  const selectedSet = new Set(selectedIds);
  const canPay = selectedIds.length >= 1 && selectedIds.length <= MAX_SEATS && !paying;
  const heldSeats = event.seats.filter((seat) => selectedIds.includes(seat.id));

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
          <Link
            className="text-sm font-bold text-white/80 hover:text-white"
            to="/events"
            onClick={(e) => void onBackToCartaz(e)}
          >
            Voltar ao cartaz
          </Link>
        </div>

        <div className="grid gap-5 justify-items-center">
          <SeatMap seats={event.seats} selectedIds={selectedSet} onToggle={toggleSeat} />

          <div className="grid w-full max-w-sm justify-items-center gap-2">
            <button
              type="button"
              className={`${btnMarquee} w-full justify-center disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={!canPay}
              onClick={() => void onPay()}
            >
              {paying ? 'Reservando…' : 'Pagar'}
            </button>
            <p className="m-0 text-xs text-white/60">
              {selectedIds.length === 0
                ? `Selecione até ${MAX_SEATS} assentos`
                : `${selectedIds.length} de ${MAX_SEATS} selecionados`}
            </p>
            {actionError ? (
              <p className="m-0 text-sm font-semibold text-[#ffb4b4]" role="alert">
                {actionError}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      {heldUntil && accessToken ? (
        <CheckoutModal
          open={checkoutOpen}
          seats={heldSeats}
          heldUntil={heldUntil}
          priceCents={event.priceCents}
          eventId={id}
          accessToken={accessToken}
          onClose={() => void onCheckoutClose()}
          onSuccess={onCheckoutSuccess}
        />
      ) : null}
    </CinemaStage>
  );
}
