import { randomInt } from 'node:crypto';

const PIN_SPACE = 1_000_000;

export function isTicketPin(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function randomTicketPin(): string {
  return String(randomInt(0, PIN_SPACE)).padStart(6, '0');
}

/** Distinct 6-digit pins for this session, skipping ones already taken. */
export function allocateTicketPins(
  taken: Iterable<string>,
  count: number,
  draw: () => string = randomTicketPin,
): string[] {
  const used = new Set(taken);
  const pins: string[] = [];
  let attempts = 0;
  while (pins.length < count) {
    if (++attempts > 10_000) {
      throw new Error('Could not allocate ticket pin');
    }
    const pin = draw();
    if (used.has(pin)) continue;
    used.add(pin);
    pins.push(pin);
  }
  return pins;
}
