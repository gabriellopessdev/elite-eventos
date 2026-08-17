import { createHmac, timingSafeEqual } from 'node:crypto';

export function qrSecret() {
  const s = process.env.QR_HMAC_SECRET?.trim();
  if (!s) throw new Error('QR_HMAC_SECRET is not set');
  return s;
}

export function signTicketId(ticketId: string): string {
  const sig = createHmac('sha256', qrSecret()).update(ticketId).digest('base64url');
  return `${ticketId}.${sig}`;
}

export function verifyTicketCode(code: string): string | null {
  const [id, sig, ...rest] = code.split('.');
  if (!id || !sig || rest.length) return null;
  const expected = createHmac('sha256', qrSecret()).update(id).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
