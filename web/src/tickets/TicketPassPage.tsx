import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getSharedTicket, type Ticket } from '../events/api';
import { ErrorNotice } from '../chrome/states';
import { skeleton } from '../ui';
import { TicketPaper } from './TicketPaper';

export function TicketPassPage() {
  const { code = '' } = useParams();
  const [attempt, setAttempt] = useState(0);

  return (
    <TicketPassView
      key={`${code}:${attempt}`}
      code={code}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function TicketPassView({ code, onRetry }: { code: string; onRetry: () => void }) {
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSharedTicket(code)
      .then((found) => {
        if (!cancelled) setTicket(found);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setTicket(null);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o ingresso');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-page p-4">
      {error ? (
        <ErrorNotice message={error} onRetry={onRetry} />
      ) : ticket === undefined ? (
        <div
          className={`${skeleton} h-[32rem] w-full max-w-[24rem]`}
          aria-label="Carregando ingresso"
        />
      ) : (
        <TicketPaper ticket={ticket} />
      )}
    </div>
  );
}
