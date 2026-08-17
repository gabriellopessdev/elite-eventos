import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CinemaStage } from '../cinema';
import { btnMarquee, fieldInput, marqueeGlow, marqueePill } from '../ui';
import {
  formatSessionWhen,
  listEvents,
  scanEvent,
  type EventSummary,
  type ScanResult,
} from '../events/api';

export function sessionDay(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const deskPanel =
  'mx-auto grid w-full max-w-lg gap-5 rounded-[1.75rem] border border-[#c4b5ff]/50 p-5 text-left md:gap-6 md:p-8';

function outcomeCopy(result: ScanResult): string {
  switch (result.outcome) {
    case 'valid':
      return `Válido · ${result.seat?.row ?? ''}${result.seat?.number ?? ''}`;
    case 'invalid':
      return 'Ingresso inválido';
    case 'used':
      return 'Já utilizado';
    case 'wrong_event':
      return 'Sessão errada';
  }
}

export function DoorPage() {
  const { session } = useAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleQuery, setTitleQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [eventId, setEventId] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session?.user.role !== 'DOOR') return;
    let cancelled = false;
    listEvents()
      .then((next) => {
        if (!cancelled) {
          setEvents(next);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setLoadError('Não foi possível carregar as sessões');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const filtered = useMemo(() => {
    return (events ?? []).filter((event) => {
      if (
        titleQuery.trim() &&
        !event.title.toLowerCase().includes(titleQuery.trim().toLowerCase())
      ) {
        return false;
      }
      if (dateFilter && sessionDay(event.startsAt) !== dateFilter) {
        return false;
      }
      return true;
    });
  }, [events, titleQuery, dateFilter]);

  if (eventId && !filtered.some((event) => event.id === eventId)) {
    setEventId('');
    setStatus(null);
    setError(null);
  }

  if (!session) {
    return <Navigate to="/login?next=/door" replace />;
  }
  if (session.user.role !== 'DOOR') {
    return <Navigate to="/events" replace />;
  }

  const accessToken = session.accessToken;
  const canSubmit = Boolean(eventId) && code.trim().length > 0 && !submitting;

  async function onValidate(event: FormEvent) {
    event.preventDefault();
    if (!eventId || !code.trim() || submitting) return;
    const submitted = code.trim();
    setSubmitting(true);
    setStatus(null);
    setError(null);
    setCode('');
    try {
      const result = await scanEvent(eventId, submitted, accessToken);
      setStatus(outcomeCopy(result));
    } catch {
      setError('Não foi possível validar o ingresso');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CinemaStage contentClassName="items-start justify-start">
      <div className={`${deskPanel} my-2 md:my-4`} style={marqueeGlow}>
        <div className="grid gap-2">
          <p className={marqueePill}>Portaria</p>
          <h1 className="m-0 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Validar
          </h1>
        </div>

        {loadError ? (
          <p className="m-0 text-sm text-white" role="alert">
            {loadError}
          </p>
        ) : null}

        {events === null && !loadError ? (
          <p className="m-0 text-sm text-white/80">Carregando sessões…</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="door-date">
            Data
            <input
              id="door-date"
              type="date"
              className={`${fieldInput} font-normal`}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="door-title">
            Título
            <input
              id="door-title"
              className={`${fieldInput} font-normal`}
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="door-session">
          Sessão
          <select
            id="door-session"
            className={`${fieldInput} font-normal`}
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setStatus(null);
              setError(null);
            }}
          >
            <option value="">Escolha a sessão</option>
            {filtered.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} · {formatSessionWhen(event.startsAt)}
              </option>
            ))}
          </select>
        </label>

        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onValidate}>
          <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="door-code">
            Código
            <input
              id="door-code"
              className={`${fieldInput} font-normal`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button className={btnMarquee} type="submit" disabled={!canSubmit}>
            Validar
          </button>
        </form>

        {status ? (
          <p className="m-0 text-base font-bold text-white" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="m-0 text-sm text-white" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </CinemaStage>
  );
}
