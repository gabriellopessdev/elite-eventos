import type { Ticket } from '../events/api';

export const TICKET_STATUS_LABEL: Record<Ticket['status'], string> = {
  UNUSED: 'Não usado',
  USED: 'Usado',
  EXPIRED: 'Expirado',
};

export function formatTicketPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) return pin;
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

export function seatLabel(seat: Ticket['seat']) {
  return seat ? `${seat.row}${seat.number}` : '—';
}

export function canReturnTicket(ticket: Ticket, nowMs: number) {
  if (ticket.status !== 'UNUSED') return false;
  const startsAt = ticket.event?.startsAt;
  if (!startsAt) return false;
  return new Date(startsAt).getTime() > nowMs;
}

export function ticketShareUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, '')}/t/${code}`;
}

export async function shareTicketPass(url: string): Promise<'shared' | 'copied'> {
  const share = navigator.share?.bind(navigator);
  if (share) {
    try {
      await share({ url });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
