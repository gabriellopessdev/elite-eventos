import { describe, expect, it } from 'vitest';
import type { Seat } from './api';
import { nextSelectedIdsAfterPoll, shouldPollSeatMap } from './seat-map-poll';

const seats: Seat[] = [
  { id: 'a1', row: 'A', number: 1, status: 'HELD' },
  { id: 'a2', row: 'A', number: 2, status: 'AVAILABLE' },
  { id: 'a3', row: 'A', number: 3, status: 'SOLD' },
];

describe('shouldPollSeatMap', () => {
  const startsAt = '2026-10-01T20:00:00.000Z';
  const now = Date.parse('2026-09-01T00:00:00.000Z');

  it('aba visível e sessão à venda → true', () => {
    expect(shouldPollSeatMap({ startsAt, nowMs: now, visible: true })).toBe(true);
  });

  it('aba escondida ou startsAt passado → false', () => {
    expect(shouldPollSeatMap({ startsAt, nowMs: now, visible: false })).toBe(false);
    expect(
      shouldPollSeatMap({
        startsAt: '2026-08-01T20:00:00.000Z',
        nowMs: now,
        visible: true,
      }),
    ).toBe(false);
  });
});

describe('nextSelectedIdsAfterPoll', () => {
  it('tira assento que outro segurou; mantém AVAILABLE e myHold', () => {
    expect(nextSelectedIdsAfterPoll(['a1', 'a2'], seats, undefined)).toEqual(['a2']);
    expect(nextSelectedIdsAfterPoll(['a1', 'a2'], seats, ['a1'])).toEqual(['a1', 'a2']);
  });

  it('SOLD some da seleção', () => {
    expect(nextSelectedIdsAfterPoll(['a3'], seats, undefined)).toEqual([]);
  });
});
