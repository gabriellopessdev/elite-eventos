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

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export type Seat = {
  id: string;
  row: string;
  number: number;
  status: SeatStatus;
};

export type EventDetail = EventSummary & {
  seats: Seat[];
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

export async function getEvent(id: string): Promise<EventDetail | null> {
  const res = await fetch(apiUrl(`/events/${id}`));
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Não foi possível carregar a sessão');
  }
  return res.json() as Promise<EventDetail>;
}

export type MovieHit = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
};

export type CreateEventInput = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  startsAt: string;
  priceCents: number;
};

export async function searchMovies(query: string, accessToken: string): Promise<MovieHit[]> {
  const res = await fetch(`${apiUrl('/movies/search')}?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Não foi possível buscar no TMDb');
  }
  const body = (await res.json()) as { results: MovieHit[] };
  return body.results;
}

export async function createEvent(
  input: CreateEventInput,
  accessToken: string,
): Promise<EventSummary> {
  const res = await fetch(apiUrl('/events'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error('Não foi possível publicar a sessão');
  }
  return res.json() as Promise<EventSummary>;
}

export function reaisToCents(raw: string) {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
