import { useEffect, useState } from 'react';
import { listEvents, type EventSummary } from './api';

export function useEventCatalog() {
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

  return { events, error, loading: events === null && !error };
}
