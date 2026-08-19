import { afterEach, describe, expect, it, vi } from 'vitest';
import { canReturnTicket, formatTicketPin, shareTicketPass, ticketShareUrl } from './pass';

describe('ticket pass helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ticketShareUrl monta /t/<code> sem encode do ponto', () => {
    expect(ticketShareUrl('https://elite.example', 'uuid-1.abc_sig')).toBe(
      'https://elite.example/t/uuid-1.abc_sig',
    );
  });

  it('formatTicketPin quebra 6 dígitos', () => {
    expect(formatTicketPin('384291')).toBe('384 291');
    expect(formatTicketPin('12')).toBe('12');
  });

  it('shareTicketPass prefere navigator.share', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    await expect(shareTicketPass('https://x/t/a.b')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: 'https://x/t/a.b' });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('AbortError não copia', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(abort),
      clipboard: { writeText: vi.fn() },
    });
    await expect(shareTicketPass('https://x/t/a.b')).rejects.toMatchObject({ name: 'AbortError' });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('sem share, copia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(shareTicketPass('https://x/t/a.b')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/t/a.b');
  });
});

const base = {
  id: 't1',
  eventId: 'e1',
  seatId: 's1',
  code: 't1.sig',
  pin: '384291',
  createdAt: '2026-08-17T12:00:00.000Z',
  event: { id: 'e1', title: 'Duna', posterPath: null, startsAt: '2026-10-01T20:00:00.000Z' },
  seat: { row: 'A', number: 1 },
} as const;

describe('canReturnTicket', () => {
  const now = Date.parse('2026-09-01T00:00:00.000Z');

  it('UNUSED futuro → true', () => {
    expect(canReturnTicket({ ...base, status: 'UNUSED' }, now)).toBe(true);
  });

  it('USED, EXPIRED ou startsAt passado → false', () => {
    expect(canReturnTicket({ ...base, status: 'USED' }, now)).toBe(false);
    expect(canReturnTicket({ ...base, status: 'EXPIRED' }, now)).toBe(false);
    expect(
      canReturnTicket(
        { ...base, status: 'UNUSED', event: { ...base.event, startsAt: '2026-08-01T20:00:00.000Z' } },
        now,
      ),
    ).toBe(false);
  });
});
