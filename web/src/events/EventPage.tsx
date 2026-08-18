import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CinemaStage } from '../cinema';
import { EmptyNotice, ErrorNotice } from '../chrome/states';
import { ConfirmDialog } from '../chrome/ConfirmDialog';
import {
  badgeNeutral,
  btn,
  btnGhost,
  btnQuiet,
  hintError,
  pill,
  seatBase,
  seatTone,
  skeleton,
} from '../ui';
import { ChevronIcon, ClockIcon, TicketIcon } from '../icons';
import { CheckoutModal, type CloseReason } from './CheckoutModal';
import {
  ApiError,
  archiveEvent,
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

const statusTone: Record<Seat['status'], string> = {
  AVAILABLE: seatTone.free,
  HELD: seatTone.held,
  SOLD: seatTone.sold,
};

const seatLabel: Record<Seat['status'], string> = {
  AVAILABLE: 'disponível',
  HELD: 'reservado',
  SOLD: 'vendido',
};

/** 28px no mobile: é o que faz uma sala de 10 colunas caber em 390px sem rolar. */
const seatSize = 'size-7 md:size-10';

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

type SeatMapProps = {
  seats: Seat[];
  selectedIds: Set<string>;
  onToggle: (seat: Seat) => void;
};

function LegendKey({ tone, children }: { tone: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${seatBase} size-4 ${tone}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function SeatMap({ seats, selectedIds, onToggle }: SeatMapProps) {
  const rows = seatsByRow(seats);

  return (
    <div className="grid w-full min-w-0 justify-items-center gap-5 md:gap-6">
      <div className="grid w-full max-w-lg justify-items-center gap-1.5">
        <div className="h-2 w-full rounded-t-[50%] bg-linear-to-b from-lavender/65 to-transparent" />
        <span className="text-[11px] font-bold tracking-[0.14em] text-faint uppercase">
          Selecione os assentos
        </span>
      </div>

      {/* min-w-0 é o que faz o overflow valer: sem ele o filho de grid cresce
          até o conteúdo e a sala vaza da tela em vez de rolar. */}
      <div className="-mx-4 w-[calc(100%+2rem)] min-w-0 overflow-x-auto px-4 md:mx-0 md:w-full md:px-0">
        <div className="mx-auto grid w-max gap-1 md:gap-2" role="img" aria-label="Mapa de assentos">
          {rows.map(([row, cells]) => (
            <div key={row} className="flex items-center gap-1 md:gap-2.5">
              <span className="w-4 text-center text-xs font-bold text-faint">{row}</span>
              <div className="flex gap-1 md:gap-2">
                {cells.map((seat) => {
                  const selected = selectedIds.has(seat.id);
                  const selectable = seat.status === 'AVAILABLE';
                  const label = `${seat.row}${seat.number} ${
                    selected ? 'selecionado' : seatLabel[seat.status]
                  }`;
                  const tone = selected ? seatTone.selected : statusTone[seat.status];

                  if (!selectable) {
                    return (
                      <span
                        key={seat.id}
                        className={`${seatBase} ${seatSize} ${tone}`}
                        aria-label={label}
                      />
                    );
                  }

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      className={`${seatBase} ${seatSize} ${tone}`}
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => onToggle(seat)}
                    />
                  );
                })}
              </div>
              {/* No mobile a fila já está rotulada à esquerda; repetir à direita
                  só rouba 26px de uma tela que não sobra largura. */}
              <span className="hidden w-4 text-center text-xs font-bold text-faint md:block">
                {row}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quatro estados, cada um com preenchimento próprio: antes reservado e
          vendido eram a mesma cor, e nenhum dos dois se distinguia do fundo. */}
      <p className="m-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-muted">
        <LegendKey tone={seatTone.free}>Livre</LegendKey>
        <LegendKey tone="border-white bg-white">Seu</LegendKey>
        <LegendKey tone={seatTone.held}>Reservado</LegendKey>
        <LegendKey tone={seatTone.sold}>Vendido</LegendKey>
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
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Um hold só é liberado uma vez, mesmo passando por expirar e depois fechar. */
  const releasedRef = useRef(false);

  function retry() {
    setError(null);
    setEvent(undefined);
    setAttempt((n) => n + 1);
  }

  useEffect(() => {
    let cancelled = false;

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
          } else if (!next.myHold) {
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
  }, [id, accessToken, role, attempt]);

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
      releasedRef.current = false;
      setEvent((prev) =>
        prev
          ? { ...prev, seats: mergeHeldSeats(prev.seats, result.seats), myHold: undefined }
          : prev,
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

  async function onCheckoutClose(reason: CloseReason) {
    /* Expirou: o modal fica montado para explicar o que aconteceu — antes ele
       sumia sozinho e a pessoa ficava achando que tinha comprado. */
    if (reason === 'cancel') {
      setCheckoutOpen(false);
      setHeldUntil(null);
      setSelectedIds([]);
    }

    if (!accessToken || role !== 'CUSTOMER') return;

    if (!releasedRef.current) {
      releasedRef.current = true;
      try {
        await releaseHold(id, accessToken);
      } catch {
        setActionError('Não foi possível liberar a reserva');
      }
    }

    if (reason !== 'cancel') return;

    try {
      const next = await getEvent(id, accessToken);
      if (next) setEvent(next);
    } catch {
      /* o DELETE já foi; o mapa fica com o último estado conhecido */
    }
  }

  /** Sucesso: fecha modal sem DELETE (assentos já SOLD) e vai aos ingressos. */
  function onCheckoutSuccess() {
    setCheckoutOpen(false);
    setHeldUntil(null);
    releasedRef.current = true;
    navigate('/tickets');
  }

  /**
   * Abandono SPA: não liberamos no unmount (Strict Mode).
   * Só DELETE em onClose (X, Cancelar, timer) e em "Voltar ao cartaz".
   * Clique no fundo não fecha. Ao cancelar: desmarca e busca o mapa de novo.
   */
  async function onBackToCartaz(e: MouseEvent<HTMLAnchorElement>) {
    if (!checkoutOpen) return;
    e.preventDefault();
    await onCheckoutClose('cancel');
    navigate('/events');
  }

  async function onArchive() {
    if (!accessToken || role !== 'ORGANIZER') return;
    setConfirmArchive(false);

    setArchiving(true);
    setActionError(null);
    try {
      await archiveEvent(id, accessToken);
      navigate('/events');
    } catch {
      setActionError('Não foi possível encerrar a sessão');
    } finally {
      setArchiving(false);
    }
  }

  if (error) {
    return (
      <CinemaStage>
        <div className="w-full max-w-md">
          <ErrorNotice message={error} onRetry={retry} />
        </div>
      </CinemaStage>
    );
  }

  if (event === undefined) {
    return (
      <CinemaStage>
        <div className="grid w-full max-w-3xl gap-8 md:grid-cols-[minmax(0,16rem)_1fr]">
          <div className={`${skeleton} aspect-2/3 w-40 justify-self-center md:w-full`} />
          <div className="grid content-start gap-3">
            <div className={`${skeleton} h-8 w-3/5`} />
            <div className={`${skeleton} h-4 w-2/5`} />
            <div className={`${skeleton} mt-4 h-56 w-full`} />
          </div>
        </div>
      </CinemaStage>
    );
  }

  if (event === null) {
    return (
      <CinemaStage>
        <div className="w-full max-w-md">
          <EmptyNotice
            title="Sessão não encontrada"
            description="Ela pode ter sido encerrada pelo organizador."
          >
            <Link className={btn} to="/events">
              Voltar ao cartaz
            </Link>
          </EmptyNotice>
        </div>
      </CinemaStage>
    );
  }

  const poster = posterUrl(event.posterPath, 'w500');
  const selectedSet = new Set(selectedIds);
  const canPay = selectedIds.length >= 1 && selectedIds.length <= MAX_SEATS && !paying;
  const heldSeats = event.seats.filter((seat) => selectedIds.includes(seat.id));
  const isOwner =
    role === 'ORGANIZER' && !!session?.user.id && session.user.id === event.organizerId;

  return (
    <CinemaStage contentClassName="items-start justify-center">
      {/* min-w-0 em toda a cadeia: um item de grid/flex cresce até o conteúdo
          por padrão, e sem isso a sala vaza da tela em vez de rolar. */}
      <article className="mx-auto grid w-full max-w-6xl min-w-0 gap-8 pb-52 md:grid-cols-[minmax(0,17rem)_1fr] md:items-start md:gap-12 md:pb-24">
        <div className="grid gap-4 md:sticky md:top-28">
          <Link
            className={`${btnQuiet} justify-self-start`}
            to="/events"
            onClick={(e) => void onBackToCartaz(e)}
          >
            <ChevronIcon size={20} className="rotate-180" />
            Voltar ao cartaz
          </Link>

          <div className="grid grid-cols-[6rem_1fr] items-start gap-4 md:grid-cols-1">
            {poster ? (
              <img
                src={poster}
                alt=""
                className="aspect-2/3 w-full overflow-hidden rounded-2xl border border-line-strong object-cover shadow-elev-2"
              />
            ) : (
              <div
                className="aspect-2/3 w-full rounded-2xl border border-line-strong bg-surface-high"
                aria-hidden="true"
              />
            )}

            <div className="grid justify-items-start gap-2">
              <span className={pill}>Em cartaz</span>
              <h1 className="m-0 text-2xl font-extrabold tracking-tight md:text-3xl">
                {event.title}
              </h1>
              <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
                <ClockIcon size={17} />
                {formatSessionWhen(event.startsAt)}
              </p>
              <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
                <TicketIcon size={17} />
                {formatPrice(event.priceCents)} por assento
              </p>
            </div>
          </div>

          {isOwner ? (
            <button
              type="button"
              className={`${btnGhost} min-h-10 justify-self-start text-sm disabled:cursor-not-allowed disabled:opacity-60`}
              disabled={archiving}
              onClick={() => setConfirmArchive(true)}
            >
              {archiving ? 'Encerrando…' : 'Encerrar sessão'}
            </button>
          ) : null}
        </div>

        <div className="grid justify-items-center gap-5">
          <SeatMap seats={event.seats} selectedIds={selectedSet} onToggle={toggleSeat} />
          {actionError ? (
            <p className={`m-0 ${hintError}`} role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      </article>

      {/* Resumo fixo: a contagem e o total acompanham o dedo em vez de ficarem
          acima da dobra, atrás do mapa. No mobile ele se apoia na tab bar (4rem
          + safe area) em vez de disputar o mesmo rodapé. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md md:bottom-4 md:mx-auto md:max-w-3xl md:rounded-2xl md:border md:px-6">
        <div className="mx-auto grid max-w-6xl gap-3 md:flex md:items-center md:justify-between md:gap-8">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 md:justify-start">
            <span className="text-[13px] whitespace-nowrap text-muted">
              {selectedIds.length} de {MAX_SEATS} assentos
            </span>
            <span className="flex flex-wrap justify-end gap-1.5">
              {heldSeats.map((seat) => (
                <span key={seat.id} className={badgeNeutral}>
                  {seat.row}
                  {seat.number}
                </span>
              ))}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="grid md:justify-items-end">
              <span className="text-[13px] text-faint">Total</span>
              <span className="text-xl font-extrabold tabular-nums">
                {formatPrice(event.priceCents * selectedIds.length)}
              </span>
            </span>
            <button
              type="button"
              className={`${btn} min-h-13 shrink-0 px-5 text-base md:px-6`}
              disabled={!canPay}
              onClick={() => void onPay()}
            >
              {paying ? 'Reservando…' : 'Reservar e pagar'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title="Encerrar esta sessão?"
        description="Ela sai do cartaz e ninguém mais compra. Os ingressos já emitidos continuam válidos na portaria."
        confirmLabel={archiving ? 'Encerrando…' : 'Encerrar sessão'}
        cancelLabel="Manter no cartaz"
        pending={archiving}
        onConfirm={() => void onArchive()}
        onCancel={() => setConfirmArchive(false)}
      />

      {heldUntil && accessToken && checkoutOpen ? (
        <CheckoutModal
          key={heldUntil}
          open
          seats={heldSeats}
          heldUntil={heldUntil}
          priceCents={event.priceCents}
          eventId={id}
          accessToken={accessToken}
          onClose={(reason) => void onCheckoutClose(reason)}
          onSuccess={onCheckoutSuccess}
        />
      ) : null}
    </CinemaStage>
  );
}
