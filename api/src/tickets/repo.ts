import { TicketStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { SESSION_SCAN_GRACE_MS } from '../events/session-window.js';
import { isTicketPin } from './pin.js';
import { verifyTicketCode } from './qr.js';

export type ScanOutcome = 'valid' | 'invalid' | 'used' | 'wrong_event' | 'expired';

export type ScanResult = {
  outcome: ScanOutcome;
  seat?: { row: string; number: number };
};

type TicketWithSeat = {
  id: string;
  eventId: string;
  status: TicketStatus;
  seat: { row: string; number: number };
};

export async function expireTicketsPastWindow(now = new Date()) {
  const cutoff = new Date(now.getTime() - SESSION_SCAN_GRACE_MS);
  return prisma.ticket.updateMany({
    where: {
      status: TicketStatus.UNUSED,
      event: { startsAt: { lte: cutoff } },
    },
    data: { status: TicketStatus.EXPIRED },
  });
}

export async function scanTicket({
  eventId,
  code,
}: {
  eventId: string;
  code: string;
}): Promise<ScanResult> {
  const trimmed = code.trim();
  await expireTicketsPastWindow();

  if (isTicketPin(trimmed)) {
    const ticket = await prisma.ticket.findUnique({
      where: { eventId_pin: { eventId, pin: trimmed } },
      include: { seat: { select: { row: true, number: true } } },
    });
    if (!ticket) return { outcome: 'invalid' };
    return consumeScannedTicket(ticket);
  }

  const ticketId = verifyTicketCode(trimmed);
  if (!ticketId) return { outcome: 'invalid' };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { seat: { select: { row: true, number: true } } },
  });
  if (!ticket) return { outcome: 'invalid' };
  if (ticket.eventId !== eventId) return { outcome: 'wrong_event' };

  return consumeScannedTicket(ticket);
}

async function consumeScannedTicket(ticket: TicketWithSeat): Promise<ScanResult> {
  if (ticket.status === TicketStatus.USED) return { outcome: 'used' };
  if (ticket.status === TicketStatus.EXPIRED) return { outcome: 'expired' };

  const updated = await prisma.ticket.updateMany({
    where: { id: ticket.id, eventId: ticket.eventId, status: TicketStatus.UNUSED },
    data: { status: TicketStatus.USED },
  });
  if (updated.count !== 1) {
    const latest = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    if (latest?.status === TicketStatus.EXPIRED) return { outcome: 'expired' };
    return { outcome: 'used' };
  }

  return {
    outcome: 'valid',
    seat: { row: ticket.seat.row, number: ticket.seat.number },
  };
}

/** Customer's tickets, newest first — event + seat for /tickets grouping. */
export async function listTicketsForUser(userId: string) {
  await expireTicketsPastWindow();
  return prisma.ticket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      event: { select: { id: true, title: true, posterPath: true, startsAt: true } },
      seat: { select: { row: true, number: true } },
    },
  });
}

const shareTicketSelect = {
  id: true,
  eventId: true,
  seatId: true,
  code: true,
  pin: true,
  status: true,
  createdAt: true,
  event: { select: { id: true, title: true, posterPath: true, startsAt: true } },
  seat: { select: { row: true, number: true } },
} as const;

export async function getTicketByShareCode(code: string) {
  await expireTicketsPastWindow();
  const ticketId = verifyTicketCode(code.trim());
  if (!ticketId) return null;
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    select: shareTicketSelect,
  });
}
