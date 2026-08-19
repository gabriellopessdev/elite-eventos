import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';
import { createEvent, listEvents } from '../src/events/repo.js';
import {
  SESSION_SCAN_GRACE_MS,
  listStartsAfter,
  saleOpen,
  scanOpen,
} from '../src/events/session-window.js';

describe('events/session-window', () => {
  let organizerId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('expire-repo-test');
    const org = await prisma.user.upsert({
      where: { email: 'expire-repo-org@elite.local' },
      create: {
        email: 'expire-repo-org@elite.local',
        passwordHash,
        name: 'Expire Repo Org',
        role: Role.ORGANIZER,
      },
      update: { passwordHash },
    });
    organizerId = org.id;
  });

  beforeEach(async () => {
    await cleanupOrgEvents();
  });

  afterAll(async () => {
    await cleanupOrgEvents();
    await prisma.$disconnect();
  });

  async function cleanupOrgEvents() {
    await prisma.ticket.deleteMany({ where: { event: { organizerId } } });
    await prisma.event.deleteMany({ where: { organizerId } });
  }

  async function seedSession(title: string, startsAt: Date) {
    return createEvent({
      tmdbId: 1,
      title,
      posterPath: null,
      startsAt,
      priceCents: 2000,
      organizerId,
    });
  }

  test('saleOpen / scanOpen / listStartsAfter', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const started = new Date(now.getTime() - 60 * 1000);
    const expired = new Date(now.getTime() - SESSION_SCAN_GRACE_MS - 60 * 1000);

    expect(saleOpen(started, now)).toBe(false);
    expect(saleOpen(future, now)).toBe(true);
    expect(scanOpen(started, now)).toBe(true);
    expect(scanOpen(expired, now)).toBe(false);
    expect(listStartsAfter(now, false).getTime()).toBe(now.getTime());
    expect(listStartsAfter(now, true).getTime()).toBe(now.getTime() - SESSION_SCAN_GRACE_MS);
  });

  test('listEvents sale catalog contains future, omits started and expired', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const started = new Date(now.getTime() - 60 * 1000);
    const expired = new Date(now.getTime() - SESSION_SCAN_GRACE_MS - 60 * 1000);

    const futureEvent = await seedSession('Future', future);
    const startedEvent = await seedSession('Started', started);
    const expiredEvent = await seedSession('Expired', expired);

    const listed = await listEvents({ now });
    const ids = listed.map((e) => e.id);
    expect(ids).toContain(futureEvent.id);
    expect(ids).not.toContain(startedEvent.id);
    expect(ids).not.toContain(expiredEvent.id);

    expect(saleOpen(started)).toBe(false);
    expect(scanOpen(started)).toBe(true);
    expect(scanOpen(expired)).toBe(false);
  });

  test('listEvents includeStarted contains future and started, omits expired', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const started = new Date(now.getTime() - 60 * 1000);
    const expired = new Date(now.getTime() - SESSION_SCAN_GRACE_MS - 60 * 1000);

    const futureEvent = await seedSession('Future', future);
    const startedEvent = await seedSession('Started', started);
    const expiredEvent = await seedSession('Expired', expired);

    const listed = await listEvents({ now, includeStarted: true });
    const ids = listed.map((e) => e.id);
    expect(ids).toContain(futureEvent.id);
    expect(ids).toContain(startedEvent.id);
    expect(ids).not.toContain(expiredEvent.id);
  });
});
