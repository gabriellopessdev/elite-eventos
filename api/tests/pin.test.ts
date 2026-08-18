import { describe, expect, test } from 'vitest';
import { allocateTicketPins, isTicketPin, randomTicketPin } from '../src/tickets/pin.js';

describe('tickets/pin', () => {
  test('isTicketPin accepts only 6 digits', () => {
    expect(isTicketPin('000000')).toBe(true);
    expect(isTicketPin('384291')).toBe(true);
    expect(isTicketPin('38429')).toBe(false);
    expect(isTicketPin('3842910')).toBe(false);
    expect(isTicketPin('384 291')).toBe(false);
    expect(isTicketPin('ticket.sig')).toBe(false);
  });

  test('randomTicketPin is 6 digits', () => {
    expect(randomTicketPin()).toMatch(/^\d{6}$/);
  });

  test('allocateTicketPins skips taken and retries duplicates from draw', () => {
    const draw = sequentialDraw(['000001', '000001', '000002', '000003']);
    expect(allocateTicketPins(['000001'], 2, draw)).toEqual(['000002', '000003']);
  });

  test('allocateTicketPins throws if the space is exhausted', () => {
    const draw = () => '000001';
    expect(() => allocateTicketPins(['000001'], 1, draw)).toThrow(/allocate ticket pin/);
  });
});

function sequentialDraw(values: string[]): () => string {
  let i = 0;
  return () => {
    const next = values[i];
    i += 1;
    if (!next) throw new Error('draw exhausted');
    return next;
  };
}
