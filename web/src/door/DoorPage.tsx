import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { btn, fieldInput, fieldLabel, hintError, skeleton, surface, surfaceHigh } from '../ui';
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon } from '../icons';
import {
  formatSessionWhen,
  listEvents,
  posterUrl,
  scanEvent,
  type EventSummary,
  type ScanOutcome,
  type ScanResult,
} from '../events/api';
import { QrCamera } from './QrCamera';

const SAME_CODE_PAUSE_MS = 2000;
const HISTORY_SIZE = 4;

export function sessionDay(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

/**
 * Na portaria a pessoa olha por meio segundo, com o celular na mão e a fila
 * andando. O resultado é painel de cor cheia — e cor nunca é o único sinal:
 * cada desfecho tem ícone e texto próprios.
 */
const outcomeTone: Record<ScanOutcome, string> = {
  valid: 'bg-success text-[#06251a]',
  used: 'bg-warn text-[#2a1c00]',
  invalid: 'bg-danger text-[#3a0a0a]',
  wrong_event: 'border border-line-strong bg-surface-high text-danger',
};

const outcomeDot: Record<ScanOutcome, string> = {
  valid: 'bg-success',
  used: 'bg-warn',
  invalid: 'bg-danger',
  wrong_event: 'bg-danger',
};

function OutcomeIcon({ outcome }: { outcome: ScanOutcome }) {
  if (outcome === 'valid') return <CheckIcon size={32} strokeWidth={2.5} />;
  if (outcome === 'used') return <ClockIcon size={32} strokeWidth={2.25} />;
  if (outcome === 'invalid') return <CloseIcon size={32} strokeWidth={2.25} />;
  return <AlertIcon size={32} strokeWidth={2.25} />;
}

type Reading = { id: number; outcome: ScanOutcome; text: string; at: string };

/** Card de sessão: o pôster é o que o porteiro reconhece de relance na fila. */
function SessionCard({
  event,
  selected,
  onSelect,
}: {
  event: EventSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const poster = posterUrl(event.posterPath, 'w185');

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`grid w-full cursor-pointer gap-2 rounded-2xl border bg-surface p-2 text-left ${
        selected ? 'border-accent shadow-glow' : 'border-line hover:border-line-strong'
      }`}
    >
      <span className="relative block">
        {poster ? (
          <img src={poster} alt="" className="aspect-2/3 w-full rounded-xl object-cover" />
        ) : (
          <span className="block aspect-2/3 w-full rounded-xl bg-surface-high" />
        )}
        {selected ? (
          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-accent text-accent-ink">
            <CheckIcon size={16} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="grid gap-0.5 px-1 pb-1">
        <span className={`truncate font-bold ${selected ? 'text-ink' : 'text-muted'}`}>
          {event.title}
        </span>
        <span className="text-[13px] text-faint tabular-nums">
          {formatSessionWhen(event.startsAt)}
        </span>
      </span>
    </button>
  );
}

export function DoorPage() {
  const { session } = useAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [titleQuery, setTitleQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [eventId, setEventId] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ignoreCode, setIgnoreCode] = useState<string | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const pauseRef = useRef<{ code: string; until: number } | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | 0>(0);
  const inFlightRef = useRef(false);

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

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

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
    setResult(null);
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
  const chosen = filtered.find((event) => event.id === eventId) ?? null;

  function armPause(nextCode: string) {
    pauseRef.current = { code: nextCode, until: Date.now() + SAME_CODE_PAUSE_MS };
    setIgnoreCode(nextCode);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      pauseRef.current = null;
      setIgnoreCode(null);
      pauseTimerRef.current = 0;
    }, SAME_CODE_PAUSE_MS);
  }

  async function submitScan(raw: string) {
    const submitted = raw.trim();
    if (!eventId || !submitted || inFlightRef.current) return;
    const pause = pauseRef.current;
    if (pause && pause.code === submitted && Date.now() < pause.until) return;

    inFlightRef.current = true;
    armPause(submitted);
    setSubmitting(true);
    setResult(null);
    setError(null);
    setCode('');
    try {
      const next = await scanEvent(eventId, submitted, accessToken);
      setResult(next);
      setHistory((prev) =>
        [
          {
            id: Date.now(),
            outcome: next.outcome,
            text: outcomeCopy(next),
            at: new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date()),
          },
          ...prev,
        ].slice(0, HISTORY_SIZE),
      );
    } catch {
      setError('Não foi possível validar o ingresso');
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  async function onValidate(event: FormEvent) {
    event.preventDefault();
    await submitScan(code);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-1.5">
        <h1 className="m-0 text-3xl font-extrabold tracking-tight md:text-4xl">Validar</h1>
        <p className="m-0 text-muted">
          {chosen ? (
            <>
              Validando a entrada de <span className="font-bold text-ink">{chosen.title}</span> ·{' '}
              {formatSessionWhen(chosen.startsAt)}
            </>
          ) : (
            'Escolha a sessão para ligar a câmera e liberar a validação.'
          )}
        </p>
      </header>

      {loadError ? (
        <p className={`m-0 ${hintError}`} role="alert">
          {loadError}
        </p>
      ) : null}

      <section className={`${surfaceHigh} grid gap-3 p-4`}>
        <h2 className="m-0 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
          Filtros
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="door-date">
            Data
            <input
              id="door-date"
              type="date"
              className={`${fieldInput} font-normal`}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </label>
          <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="door-title">
            Título
            <input
              id="door-title"
              className={`${fieldInput} font-normal`}
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="m-0 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
            Sessão
          </h2>
          {events ? (
            <span className="text-[13px] text-faint">
              {filtered.length} {filtered.length === 1 ? 'sessão' : 'sessões'}
            </span>
          ) : null}
        </div>

        {events === null ? (
          <ul
            className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3"
            aria-hidden="true"
          >
            {[0, 1, 2].map((i) => (
              <li key={i} className={`${surface} grid gap-2 p-2`}>
                <span className={`${skeleton} block aspect-2/3 w-full`} />
                <span className={`${skeleton} block h-3.5 w-4/5`} />
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <p className={`${surface} m-0 px-4 py-6 text-center text-muted`}>
            Nenhuma sessão bate com os filtros.
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
            {filtered.map((event) => (
              <li key={event.id}>
                <SessionCard
                  event={event}
                  selected={event.id === eventId}
                  onSelect={() => {
                    setEventId(event.id === eventId ? '' : event.id);
                    setResult(null);
                    setError(null);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <QrCamera
        key={eventId || 'off'}
        enabled={Boolean(eventId)}
        ignoreCode={ignoreCode}
        onCode={(value) => {
          void submitScan(value);
        }}
      />

      {result ? (
        <div className={`grid gap-2 rounded-2xl px-6 py-6 ${outcomeTone[result.outcome]}`}>
          <span className="flex items-center gap-3">
            <OutcomeIcon outcome={result.outcome} />
          </span>
          <p role="status" className="m-0 text-4xl font-extrabold tracking-tight">
            {outcomeCopy(result)}
          </p>
          {chosen ? (
            <p className="m-0 font-semibold opacity-75">
              {chosen.title} · {formatSessionWhen(chosen.startsAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className={`m-0 ${hintError}`} role="alert">
          {error}
        </p>
      ) : null}

      <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onValidate}>
        <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="door-code">
          Código
          <input
            id="door-code"
            className={`${fieldInput} font-normal`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button className={`${btn} min-h-12`} type="submit" disabled={!canSubmit}>
          Validar
        </button>
      </form>

      {history.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="m-0 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
            Últimas leituras
          </h2>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {history.map((reading) => (
              <li
                key={reading.id}
                className={`${surface} grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${outcomeDot[reading.outcome]}`}
                />
                <span className="font-semibold">{reading.text}</span>
                <span className="text-[13px] text-faint tabular-nums">{reading.at}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
