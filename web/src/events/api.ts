export type EventSummary = {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  startsAt: string;
  priceCents: number;
  organizerId: string;
  createdAt: string;
};

function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ''}${path}`;
}

export function posterUrl(posterPath: string | null, size = 'w342') {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}

export function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatSessionWhen(startsAt: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(startsAt));
}

export async function listEvents(): Promise<EventSummary[]> {
  const res = await fetch(apiUrl('/events'));
  if (!res.ok) {
    throw new Error('Não foi possível carregar as sessões');
  }
  const body = (await res.json()) as { events: EventSummary[] };
  return body.events;
}
