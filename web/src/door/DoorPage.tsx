import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  btn,
  btnGhost,
  fieldInput,
  fieldLabel,
  hintError,
  skeleton,
  surface,
  surfaceHigh,
} from '../ui';
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon, ScanIcon } from '../icons';
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
const RESULT_MS = 2000;
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

/** Linha de sessão: pôster para reconhecer de relance, nome e data para conferir. */
function SessionRow({ event, onOpen }: { event: EventSummary; onOpen: () => void }) {
  const poster = posterUrl(event.posterPath, 'w185');

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${surface} grid w-full cursor-pointer grid-cols-[2.75rem_1fr_auto] items-center gap-4 p-3 text-left hover:border-line-strong hover:bg-surface-high`}
    >
      {poster ? (
        <img src={poster} alt="" className="aspect-2/3 w-full rounded-lg object-cover" />
      ) : (
        <span className="block aspect-2/3 w-full rounded-lg bg-surface-high" />
      )}
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-lg font-bold tracking-tight">{event.title}</span>
        <span className="text-[13px] text-faint tabular-nums">
          {formatSessionWhen(event.startsAt)}
        </span>
      </span>
      <span className="flex items-center gap-1.5 pr-1 text-sm font-bold text-lavender">
        <ScanIcon size={18} />
        <span className="hidden sm:inline">Validar</span>
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
  const [mode, setMode] = useState<'camera' | 'code'>('camera');
  const pauseRef = useRef<{ code: string; until: number } | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | 0>(0);
  const inFlightRef = useRef(false);

  /* O resultado toma o modal e sai sozinho: a fila anda sem ninguém tocar na
     tela entre uma pessoa e a próxima. */
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

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
  const canSubmit = Boolean(eventId) && code.length === 6 && !submitting;
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

  function openScan(nextId: string) {
    setEventId(nextId);
    setMode('camera');
    setCode('');
    setResult(null);
    setError(null);
  }

  function closeScan() {
    setEventId('');
    setResult(null);
    setError(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-1.5">
        <h1 className="m-0 text-3xl font-extrabold tracking-tight md:text-4xl">Validar</h1>
        <p className="m-0 text-muted">Toque na sessão para abrir o leitor de QR.</p>
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
          <ul className="m-0 grid list-none gap-2 p-0" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className={`${surface} grid grid-cols-[2.75rem_1fr] items-center gap-4 p-3`}
              >
                <span className={`${skeleton} block aspect-2/3 w-full`} />
                <span className={`${skeleton} block h-4 w-2/5`} />
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <p className={`${surface} m-0 px-4 py-6 text-center text-muted`}>
            Nenhuma sessão bate com os filtros.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {filtered.map((event) => (
              <li key={event.id}>
                <SessionRow event={event} onOpen={() => openScan(event.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {chosen
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
              role="presentation"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="scan-title"
                className="grid w-full max-h-dvh grid-rows-[auto_1fr_auto] gap-4 overflow-y-auto border-line-strong bg-surface-high p-4 sm:max-w-md sm:rounded-2xl sm:border sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <h2
                      id="scan-title"
                      className="m-0 truncate text-xl font-extrabold tracking-tight"
                    >
                      {chosen.title}
                    </h2>
                    <p className="m-0 text-[13px] text-faint">
                      {formatSessionWhen(chosen.startsAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${btnGhost} min-h-11 shrink-0 px-3`}
                    onClick={closeScan}
                  >
                    <CloseIcon size={20} />
                    Fechar
                  </button>
                </div>

                {mode === 'camera' ? (
                  /* Lendo QR: o resultado toma o lugar do leitor e sai sozinho
                     em 2s, para a fila andar sem ninguém tocar na tela. */
                  result ? (
                    <div
                      className={`grid content-center justify-items-start gap-3 rounded-2xl px-6 py-10 ${outcomeTone[result.outcome]}`}
                    >
                      <OutcomeIcon outcome={result.outcome} />
                      <p role="status" className="m-0 text-4xl font-extrabold tracking-tight">
                        {outcomeCopy(result)}
                      </p>
                    </div>
                  ) : (
                    <QrCamera
                      enabled
                      ignoreCode={ignoreCode}
                      onCode={(value) => {
                        void submitScan(value);
                      }}
                    />
                  )
                ) : (
                  /* Digitando: o resultado vira faixa acima do campo — quem
                     está digitando quer o campo de volta no ato, não em 2s. */
                  <div className="grid content-start gap-3">
                    {result ? (
                      <div
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 ${outcomeTone[result.outcome]}`}
                      >
                        <OutcomeIcon outcome={result.outcome} />
                        <p role="status" className="m-0 text-xl font-extrabold tracking-tight">
                          {outcomeCopy(result)}
                        </p>
                      </div>
                    ) : null}
                    <form className="grid gap-3" onSubmit={onValidate}>
                      <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="door-code">
                        Código de 6 dígitos
                        <input
                          id="door-code"
                          className={`${fieldInput} text-center font-mono text-xl tracking-[0.28em] tabular-nums`}
                          value={code}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={6}
                          placeholder="000000"
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                      </label>
                      <button className={`${btn} min-h-12`} type="submit" disabled={!canSubmit}>
                        Validar
                      </button>
                    </form>
                  </div>
                )}

                <div className="grid gap-3">
                  {error ? (
                    <p className={`m-0 ${hintError}`} role="alert">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    className={`${btnGhost} w-full`}
                    onClick={() => {
                      setMode(mode === 'camera' ? 'code' : 'camera');
                      setError(null);
                    }}
                  >
                    {mode === 'camera' ? 'Digitar o código' : 'Usar a câmera'}
                  </button>

                  {history.length > 0 ? (
                    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 border-t border-line p-0 pt-3">
                      {history.slice(0, 3).map((reading) => (
                        <li key={reading.id} className="flex items-center gap-2 text-[13px]">
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${outcomeDot[reading.outcome]}`}
                          />
                          <span className="font-semibold text-muted">{reading.text}</span>
                          <span className="text-faint tabular-nums">{reading.at}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
