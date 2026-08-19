export const SESSION_SCAN_GRACE_MS = 3 * 60 * 60 * 1000;

export function saleOpen(startsAt: Date, now = new Date()) {
  return startsAt.getTime() > now.getTime();
}

export function scanOpen(startsAt: Date, now = new Date()) {
  return startsAt.getTime() + SESSION_SCAN_GRACE_MS > now.getTime();
}

/** Public catalog: startsAt > now. Door: startsAt > now - 3h. */
export function listStartsAfter(now: Date, includeStarted: boolean) {
  if (!includeStarted) return now;
  return new Date(now.getTime() - SESSION_SCAN_GRACE_MS);
}
