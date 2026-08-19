import type { Seat } from './api';

/** Intervalo do espelho do mapa (ADR-014). */
export const SEAT_MAP_POLL_MS = 2500;

export function shouldPollSeatMap({
  startsAt,
  nowMs,
  visible,
}: {
  startsAt: string;
  nowMs: number;
  visible: boolean;
}) {
  if (!visible) return false;
  return new Date(startsAt).getTime() > nowMs;
}

/** Mantém a seleção local se o assento ainda é teu ou continua AVAILABLE. */
export function nextSelectedIdsAfterPoll(
  selectedIds: string[],
  seats: Seat[],
  myHoldSeatIds: string[] | undefined,
) {
  const mine = new Set(myHoldSeatIds ?? []);
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  return selectedIds.filter((id) => mine.has(id) || byId.get(id)?.status === 'AVAILABLE');
}
