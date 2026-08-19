import { apiFetch } from '../auth/auth';

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
  heldUntil?: string | null;
};

export type EventDetail = EventSummary & {
  seats: Seat[];
  myHold?: { seatIds: string[]; heldUntil: string };
};

export type HoldResult = {
  seats: Seat[];
  heldUntil: string;
};

export type Ticket = {
  id: string;
  eventId: string;
  seatId: string;
  code: string;
  pin: string;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  createdAt: string;
  event?: {
    id: string;
    title: string;
    posterPath: string | null;
    startsAt: string;
  };
  seat?: {
    row: string;
    number: number;
  };
};

export type ScanOutcome = 'valid' | 'invalid' | 'used' | 'wrong_event' | 'expired';

export type ScanResult = {
  outcome: ScanOutcome;
  seat?: { row: string; number: number };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readErrorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message ?? fallback;
}

function authHeaders(accessToken: string, json = false): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
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

export async function listEvents(accessToken?: string | null): Promise<EventSummary[]> {
  const res = await apiFetch('/events', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível carregar as sessões'),
      res.status,
    );
  }
  const body = (await res.json()) as { events: EventSummary[] };
  return body.events;
}

export async function getEvent(
  id: string,
  accessToken?: string | null,
): Promise<EventDetail | null> {
  const res = await apiFetch(`/events/${id}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível carregar a sessão'),
      res.status,
    );
  }
  return res.json() as Promise<EventDetail>;
}

export async function holdSeats(
  eventId: string,
  seatIds: string[],
  accessToken: string,
): Promise<HoldResult> {
  const res = await apiFetch(`/events/${eventId}/hold`, {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ seatIds }),
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível reservar os assentos'),
      res.status,
    );
  }
  return res.json() as Promise<HoldResult>;
}

export async function releaseHold(eventId: string, accessToken: string): Promise<void> {
  const res = await apiFetch(`/events/${eventId}/hold`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível liberar a reserva'),
      res.status,
    );
  }
}

export async function checkout(
  eventId: string,
  accessToken: string,
): Promise<{ tickets: Ticket[] }> {
  const res = await apiFetch(`/events/${eventId}/checkout`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível concluir o pagamento'),
      res.status,
    );
  }
  return res.json() as Promise<{ tickets: Ticket[] }>;
}

export async function archiveEvent(eventId: string, accessToken: string): Promise<EventSummary> {
  const res = await apiFetch(`/events/${eventId}/archive`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível arquivar a sessão'),
      res.status,
    );
  }
  return res.json() as Promise<EventSummary>;
}

export async function listMyTickets(accessToken: string): Promise<Ticket[]> {
  const res = await apiFetch('/tickets', {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível carregar os ingressos'),
      res.status,
    );
  }
  const body = (await res.json()) as { tickets: Ticket[] };
  return body.tickets;
}

export async function returnTicket(ticketId: string, accessToken: string): Promise<void> {
  const res = await apiFetch(`/tickets/${ticketId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (res.status === 204 || res.status === 404) return;
  if (res.status === 409) {
    throw new ApiError('Este ingresso não pode ser devolvido.', 409);
  }
  throw new ApiError(
    await readErrorMessage(res, 'Não foi possível devolver o ingresso'),
    res.status,
  );
}

export async function getSharedTicket(code: string): Promise<Ticket> {
  const res = await apiFetch(`/tickets/pass/${code}`);
  if (res.status === 404) {
    throw new ApiError('Ingresso não encontrado.', 404);
  }
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível abrir o ingresso'),
      res.status,
    );
  }
  const body = (await res.json()) as { ticket: Ticket };
  return body.ticket;
}

export async function scanEvent(
  eventId: string,
  code: string,
  accessToken: string,
): Promise<ScanResult> {
  const res = await apiFetch(`/events/${eventId}/scan`, {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível validar o ingresso'),
      res.status,
    );
  }
  return res.json() as Promise<ScanResult>;
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
  const res = await apiFetch(`/movies/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res, 'Não foi possível buscar no TMDb'), res.status);
  }
  const body = (await res.json()) as { results: MovieHit[] };
  return body.results;
}

export async function createEvent(
  input: CreateEventInput,
  accessToken: string,
): Promise<EventSummary> {
  const res = await apiFetch('/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível publicar a sessão'),
      res.status,
    );
  }
  return res.json() as Promise<EventSummary>;
}

export function reaisToCents(raw: string) {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function seatSelectionKey(eventId: string) {
  return `elite.seatSelection.${eventId}`;
}

/** Survives React Strict Mode double-mount (consume-once from sessionStorage). */
const seatSelectionCache = new Map<string, string[]>();

/** Test helper — clears in-memory restore cache between cases. */
export function clearSeatSelectionCache() {
  seatSelectionCache.clear();
}

export function saveSeatSelection(eventId: string, seatIds: string[]) {
  sessionStorage.setItem(seatSelectionKey(eventId), JSON.stringify(seatIds));
  seatSelectionCache.set(eventId, seatIds);
}

export function takeSeatSelection(eventId: string): string[] | null {
  if (seatSelectionCache.has(eventId)) {
    const cached = seatSelectionCache.get(eventId)!;
    return cached.length > 0 ? cached : null;
  }

  const key = seatSelectionKey(eventId);
  const raw = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);

  let parsed: string[] = [];
  if (raw) {
    try {
      const value = JSON.parse(raw) as unknown;
      if (Array.isArray(value) && value.every((id) => typeof id === 'string')) {
        parsed = value;
      }
    } catch {
      parsed = [];
    }
  }

  seatSelectionCache.set(eventId, parsed);
  return parsed.length > 0 ? parsed : null;
}
