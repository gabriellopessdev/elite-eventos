import { TicketStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { verifyTicketCode } from './qr.js';

export type ScanOutcome = 'valid' | 'invalid' | 'used' | 'wrong_event';

export type ScanResult = {
  outcome: ScanOutcome;
  seat?: { row: string; number: number };
};

export async function scanTicket({
  eventId,
  code,
}: {
  eventId: string;
  code: string;
}): Promise<ScanResult> {
  const ticketId = verifyTicketCode(code.trim());
  if (!ticketId) return { outcome: 'invalid' };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { seat: { select: { row: true, number: true } } },
  });
  if (!ticket) return { outcome: 'invalid' };

  if (ticket.eventId !== eventId) return { outcome: 'wrong_event' };

  if (ticket.status === TicketStatus.USED) return { outcome: 'used' };

  const updated = await prisma.ticket.updateMany({
    where: { id: ticketId, eventId, status: TicketStatus.UNUSED },
    data: { status: TicketStatus.USED },
  });
  if (updated.count !== 1) return { outcome: 'used' };

  return {
    outcome: 'valid',
    seat: { row: ticket.seat.row, number: ticket.seat.number },
  };
}

/** Customer's tickets, newest first — event + seat for /tickets grouping. */
export async function listTicketsForUser(userId: string) {
  return prisma.ticket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      event: { select: { id: true, title: true, posterPath: true, startsAt: true } },
      seat: { select: { row: true, number: true } },
    },
  });
}
