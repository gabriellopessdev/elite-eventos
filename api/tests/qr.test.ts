import { afterEach, describe, expect, test } from 'vitest';
import { qrSecret, signTicketId, verifyTicketCode } from '../src/tickets/qr.js';

const SECRET = 'test-qr-hmac-secret-elite-eventos';

describe('tickets/qr', () => {
  afterEach(() => {
    delete process.env.QR_HMAC_SECRET;
  });

  test('sign then verify returns id', () => {
    process.env.QR_HMAC_SECRET = SECRET;
    const ticketId = '11111111-2222-3333-4444-555555555555';
    const code = signTicketId(ticketId);
    expect(code).toMatch(new RegExp(`^${ticketId}\\.`));
    expect(verifyTicketCode(code)).toBe(ticketId);
  });

  test('tampered sig returns null', () => {
    process.env.QR_HMAC_SECRET = SECRET;
    const code = signTicketId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const [id, sig] = code.split('.');
    const flipped = sig!.endsWith('A') ? `${sig!.slice(0, -1)}B` : `${sig!.slice(0, -1)}A`;
    expect(verifyTicketCode(`${id}.${flipped}`)).toBeNull();
  });

  test('missing QR_HMAC_SECRET throws on sign', () => {
    delete process.env.QR_HMAC_SECRET;
    expect(() => signTicketId('any-id')).toThrow(/QR_HMAC_SECRET/);
    expect(() => qrSecret()).toThrow(/QR_HMAC_SECRET/);
  });
});
