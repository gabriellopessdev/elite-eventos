# Link compartilhável do ingresso — Implementation Plan

**Goal:** Issue implícita do roadmap #6 — o dono compartilha `https://…/t/<ticketId.sig>`; quem abre vê o ingresso read-only (pôster, QR HMAC, PIN, talão), sem login.

**Architecture:** O HMAC `Ticket.code` já é o token de capacidade (ADR-003). Sem coluna nova. `getTicketByShareCode` verifica a assinatura, dispara a lazy `EXPIRED`, devolve o ingresso sem `userId`. HTTP `GET /tickets/pass/:code` é público (`Cache-Control: no-store`). A SPA em `/t/:code` fica **fora** do Shell: um papel estreito (`max-w-[24rem]`) centrado. A câmera da porta continua lendo `ticketId.sig`, não a URL. Compartilhar é um botão no `TicketPassModal`.

**Branch:** `feat/ticket-share` a partir de `origin/main` (`git fetch origin`; `git checkout -b feat/ticket-share origin/main`).

**Fora:** busca 7a, cancel 7b, painel, WS, `shareToken` extra, OG com PIN/assento, mudar o payload do QR, restyle da carteira.

---

### Task 1: ADR-012 + ROADMAP

**Files:**
- Modify: `docs/DECISIONS.md` (após ADR-011, hoje termina ~linha 107)
- Modify: `docs/ROADMAP.md` (linhas 12–13)

- [ ] Append **ADR-012 — Link do ingresso = HMAC na URL**:
  - Capability URL: quem tem o link vê QR + PIN + assento.
  - Segredo = `Ticket.code` (`ticketId.sig`). Sem coluna nova. UUID nu rejeitado (ADR-003).
  - Web: `/t/:code` fora do Shell (como `/login`). Marca “Elite Eventos” → `/events`. Página ignora sessão.
  - API: `GET /tickets/pass/:code` sem `preHandler`. `verifyTicketCode` + lookup. HMAC lixo ou id inexistente → **404** `{ message: 'Ticket not found' }` idênticos. Nunca 401 neste GET.
  - JSON: `{ ticket }` com `id, eventId, seatId, code, pin, status, createdAt, event { id, title, posterPath, startsAt }, seat { row, number }`. **Sem `userId`.** `Cache-Control: no-store`.
  - Lazy `expireTicketsPastWindow` antes do lookup (igual `listTicketsForUser`).
  - `USED` / `EXPIRED`: 200, mesma arte, QR velado. Não consome `UNUSED→USED`.
  - Share: um botão no modal da carteira; `navigator.share({ url })` ou clipboard; payload = só a URL (`origin + '/t/' + code`).
  - QR da porta permanece HMAC puro.
  - 404 visual: mesmo papel, vazio (sem QR/PIN/assento/pôster).
- [ ] Em `docs/ROADMAP.md`:
  - Fatia 5: status `✅` (PR #10 já merged; o doc estava atrasado).
  - Fatia 6: status `⬜`, Done “abre ingresso read-only — em `feat/ticket-share`”.

---

### Task 2: `getTicketByShareCode` no repo

**Files:**
- Modify: `api/src/tickets/repo.ts` (depois de `listTicketsForUser`, ~linhas 84–95)
- Create: `api/tests/share-repo.test.ts`

- [ ] Em `api/tests/share-repo.test.ts` — e-mails `share-repo-org@elite.local` / `share-repo-cli@elite.local` (nunca `org@elite.local`). `ticket.deleteMany` antes de `event.deleteMany`. Datas relativas a `Date.now()`.

  ```ts
  import { randomUUID } from 'node:crypto';
  import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
  import { Role, SeatStatus, TicketStatus } from '@prisma/client';
  import { prisma } from '../src/db.js';
  import { hashPassword } from '../src/auth/password.js';
  import { createEvent } from '../src/events/repo.js';
  import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';
  import { signTicketId } from '../src/tickets/qr.js';
  import { randomTicketPin } from '../src/tickets/pin.js';
  import { getTicketByShareCode } from '../src/tickets/repo.js';

  process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
  process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

  describe('tickets/repo getTicketByShareCode', () => {
    let organizerId: string;
    let customerId: string;

    beforeAll(async () => {
      const passwordHash = await hashPassword('share-repo-test');
      const org = await prisma.user.upsert({
        where: { email: 'share-repo-org@elite.local' },
        create: {
          email: 'share-repo-org@elite.local',
          passwordHash,
          name: 'Share Repo Org',
          role: Role.ORGANIZER,
        },
        update: { passwordHash },
      });
      const customer = await prisma.user.upsert({
        where: { email: 'share-repo-cli@elite.local' },
        create: {
          email: 'share-repo-cli@elite.local',
          passwordHash,
          name: 'Share Repo Cli',
          role: Role.CUSTOMER,
        },
        update: { passwordHash },
      });
      organizerId = org.id;
      customerId = customer.id;
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

    async function seedFutureSession(title: string) {
      return createEvent({
        tmdbId: 1,
        title,
        posterPath: '/dune.jpg',
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        priceCents: 2000,
        organizerId,
      });
    }

    async function issueTicket({
      eventId,
      seatId,
      status = TicketStatus.UNUSED,
    }: {
      eventId: string;
      seatId: string;
      status?: TicketStatus;
    }) {
      const id = randomUUID();
      const code = signTicketId(id);
      await prisma.seat.update({
        where: { id: seatId },
        data: { status: SeatStatus.SOLD, heldById: null, heldUntil: null },
      });
      return prisma.ticket.create({
        data: {
          id,
          eventId,
          seatId,
          userId: customerId,
          code,
          pin: randomTicketPin(),
          status,
        },
      });
    }

    test('HMAC válido devolve ingresso sem userId; não consome UNUSED', async () => {
      const event = await seedFutureSession('Share ok');
      const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });

      const found = await getTicketByShareCode(issued.code);
      expect(found).toMatchObject({
        id: issued.id,
        eventId: event.id,
        code: issued.code,
        pin: issued.pin,
        status: TicketStatus.UNUSED,
        event: { title: 'Share ok', posterPath: '/dune.jpg' },
        seat: { row: event.seats[0]!.row, number: event.seats[0]!.number },
      });
      expect(found).not.toHaveProperty('userId');

      const still = await prisma.ticket.findUniqueOrThrow({ where: { id: issued.id } });
      expect(still.status).toBe(TicketStatus.UNUSED);
    });

    test('HMAC lixo, id inexistente e UUID nu → null', async () => {
      expect(await getTicketByShareCode('not-a-code')).toBeNull();
      expect(await getTicketByShareCode(signTicketId(randomUUID()))).toBeNull();
      const event = await seedFutureSession('Share uuid');
      const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
      expect(await getTicketByShareCode(issued.id)).toBeNull();
    });

    test('UNUSED fora da janela de scan vira EXPIRED no GET; USED permanece USED', async () => {
      const event = await createEvent({
        tmdbId: 1,
        title: 'Share expired',
        posterPath: null,
        startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000),
        priceCents: 2000,
        organizerId,
      });
      const unused = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
      const used = await issueTicket({
        eventId: event.id,
        seatId: event.seats[1]!.id,
        status: TicketStatus.USED,
      });

      const expired = await getTicketByShareCode(unused.code);
      expect(expired?.status).toBe(TicketStatus.EXPIRED);
      expect(await prisma.seat.findUniqueOrThrow({ where: { id: event.seats[0]!.id } })).toMatchObject({
        status: SeatStatus.SOLD,
      });

      const stillUsed = await getTicketByShareCode(used.code);
      expect(stillUsed?.status).toBe(TicketStatus.USED);
    });
  });
  ```

- [ ] Rodar `npx vitest run tests/share-repo.test.ts` em `api/`. Esperar **falha** (`getTicketByShareCode` não existe).

- [ ] Em `api/src/tickets/repo.ts`, depois de `listTicketsForUser`:

  ```ts
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
  ```

  Não chamar `consumeScannedTicket`. `select` omite `userId` de propósito.

- [ ] Rodar `npx vitest run tests/share-repo.test.ts` em `api/`. Esperar todos pass.

---

### Task 3: `GET /tickets/pass/:code`

**Files:**
- Modify: `api/src/tickets/routes.ts` (arquivo inteiro hoje, linhas 1–16)
- Create: `api/tests/share.test.ts`

- [ ] Em `api/src/tickets/routes.ts` registrar a rota **pública** ao lado da autenticada. Sem `preHandler`. `:code` é um path segment — `uuid.sig` (um ponto) cabe; find-my-way não corta no `.`.

  ```ts
  import type { FastifyInstance } from 'fastify';
  import { Role } from '@prisma/client';
  import { requireRole } from '../auth/require-auth.js';
  import { getTicketByShareCode, listTicketsForUser } from './repo.js';

  export async function ticketRoutes(app: FastifyInstance) {
    app.get('/tickets/pass/:code', async (request, reply) => {
      const { code } = request.params as { code: string };
      const ticket = await getTicketByShareCode(code);
      if (!ticket) {
        return reply
          .code(404)
          .header('Cache-Control', 'no-store')
          .send({ message: 'Ticket not found' });
      }
      return reply.header('Cache-Control', 'no-store').send({ ticket });
    });

    app.get('/tickets', { preHandler: requireRole(Role.CUSTOMER) }, async (request, reply) => {
      const userId = request.auth?.sub;
      if (!userId) {
        return reply.code(401).send({ message: 'Missing bearer token' });
      }

      const tickets = await listTicketsForUser(userId);
      return { tickets };
    });
  }
  ```

- [ ] Em `api/tests/share.test.ts` — e-mails `share-http-org@elite.local` / `share-http-cli@elite.local`. Mesmo bootstrap de `checkout.test.ts` (`buildApp`, `inject` login, `createEvent` via `POST /events`). Não reusar `checkout-http-*@`.

  Helpers mínimos:

  ```ts
  async function login(email: string, password: string) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  }

  async function createSession() {
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${orgToken}` },
      payload: {
        tmdbId: 438631,
        title: 'Duna Share',
        posterPath: '/dune-share.jpg',
        startsAt: '2026-11-01T20:00:00.000Z',
        priceCents: 4000,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; seats: Array<{ id: string }> };
  }

  async function issueViaCheckout(eventId: string, seatIds: string[]) {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/events/${eventId}/hold`,
          headers: { authorization: `Bearer ${customerToken}` },
          payload: { seatIds },
        })
      ).statusCode,
    ).toBe(200);
    const checkout = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/checkout`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(checkout.statusCode).toBe(201);
    return checkout.json() as { tickets: Array<{ id: string; code: string; pin: string }> };
  }
  ```

  Asserts:
  1. Sem `Authorization`: `GET /tickets/pass/${code}` → 200 `{ ticket }`; `ticket.userId` ausente; `ticket.code === code`; `Cache-Control` contém `no-store`.
  2. `Authorization: Bearer not-a-jwt` no pass → **200** (não 401). `GET /tickets` sem token continua **401**.
  3. `GET /tickets/pass/not-a-code` e `GET /tickets/pass/${signTicketId(randomUUID())}` → **404** `{ message: 'Ticket not found' }`, mesmo body. `GET /tickets/pass/${ticket.id}` (UUID nu) → 404.
  4. Ticket `USED` (via `prisma.ticket.update`) → 200 `{ ticket: { status: 'USED' } }`; status no DB continua `USED` (GET não consome).
  5. Backdate `startsAt` para `now - SESSION_SCAN_GRACE_MS - 60_000` com ticket `UNUSED` → 200 `{ status: 'EXPIRED' }`; assento `SOLD`.

- [ ] Rodar `npx vitest run tests/share.test.ts tests/checkout.test.ts` em `api/`. Esperar todos pass. `checkout.test.ts` cobre regressão de `GET /tickets` autenticado.

---

### Task 4: helpers de passe + `getSharedTicket`

**Files:**
- Create: `web/src/tickets/pass.ts`
- Create: `web/src/tickets/pass.test.ts`
- Modify: `web/src/events/api.ts` (depois de `listMyTickets`, ~linhas 193–205)

- [ ] `web/src/tickets/pass.ts`:

  ```ts
  import type { Ticket } from '../events/api';

  export const TICKET_STATUS_LABEL: Record<Ticket['status'], string> = {
    UNUSED: 'Não usado',
    USED: 'Usado',
    EXPIRED: 'Expirado',
  };

  export function formatTicketPin(pin: string) {
    if (!/^\d{6}$/.test(pin)) return pin;
    return `${pin.slice(0, 3)} ${pin.slice(3)}`;
  }

  export function seatLabel(seat: Ticket['seat']) {
    return seat ? `${seat.row}${seat.number}` : '—';
  }

  export function ticketShareUrl(origin: string, code: string) {
    return `${origin.replace(/\/$/, '')}/t/${code}`;
  }

  export async function shareTicketPass(url: string): Promise<'shared' | 'copied'> {
    const share = navigator.share?.bind(navigator);
    if (share) {
      try {
        await share({ url });
        return 'shared';
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
      }
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  }
  ```

  `AbortError` (cancelou o sheet) **não** cai no clipboard.

- [ ] `web/src/tickets/pass.test.ts`:

  ```ts
  import { afterEach, describe, expect, it, vi } from 'vitest';
  import { formatTicketPin, shareTicketPass, ticketShareUrl } from './pass';

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
  ```

- [ ] Em `web/src/events/api.ts`, **sem** `Authorization`. Usa `apiFetch` para respeitar `VITE_API_URL` em produção (duas origens). Sem Bearer → 401 não dispara refresh.

  ```ts
  export async function getSharedTicket(code: string): Promise<Ticket> {
    const res = await apiFetch(`/tickets/pass/${code}`);
    if (res.status === 404) {
      throw new ApiError('Ingresso não encontrado.', 404);
    }
    if (!res.ok) {
      throw new ApiError(
        await readErrorMessage(res, 'Não foi possível abrir o ingresso'),
        res.status,
      );
    }
    const body = (await res.json()) as { ticket: Ticket };
    return body.ticket;
  }
  ```

  Não usar `encodeURIComponent(code)`: `base64url` + UUID já são URL-safe; o ponto do HMAC precisa ficar ponto (a rota `:code` é um segment).

- [ ] Rodar `npx vitest run src/tickets/pass.test.ts` em `web/`. Esperar todos pass.

---

### Task 5: papel do ingresso + página `/t/:code`

**Files:**
- Create: `web/src/tickets/TicketQr.tsx` (extrair de `TicketPassModal.tsx` linhas 19–48 — mesmo markup, inclusive `data-testid="qr-placeholder"`)
- Create: `web/src/tickets/TicketPaper.tsx`
- Create: `web/src/tickets/TicketPassPage.tsx`
- Create: `web/src/tickets/TicketPassPage.test.tsx`
- Modify: `web/src/tickets/TicketPassModal.tsx` — importar `TicketQr`, `formatTicketPin`, `TICKET_STATUS_LABEL`, `seatLabel` de `./pass` e `./TicketQr` (o botão Compartilhar entra na Task 6)
- Modify: `web/src/App.tsx` linhas 20–30
- Modify: `web/src/icons.tsx` — não precisa nesta task
- Não modificar `web/vite.config.ts`: `/t` **não** entra no proxy. HTML de `/t/...` já é a SPA; `fetch('/tickets/pass/...')` já cai no proxy `/tickets`. Produção: `serve -s dist` já faz fallback SPA.

- [ ] `TicketQr.tsx` — mover o componente interno sem mudar classes nem o `data-testid`.

- [ ] `TicketPaper.tsx` — um objeto `w-full max-w-[24rem]`. Viewport **não** é `CinemaStage` (esse tem `pt-24` da pílula). Fundo da página = `bg-page`.

  ```tsx
  import { Link } from 'react-router-dom';
  import { formatSessionWhen, posterUrl, type Ticket } from '../events/api';
  import { badgeOk, badgeUsed } from '../ui';
  import { CheckIcon } from '../icons';
  import { TicketQr } from './TicketQr';
  import { TICKET_STATUS_LABEL, formatTicketPin, seatLabel } from './pass';

  export function TicketPaper({ ticket }: { ticket: Ticket | null }) {
    const missing = ticket === null;
    const used = ticket ? ticket.status === 'USED' || ticket.status === 'EXPIRED' : false;
    const poster = ticket ? posterUrl(ticket.event?.posterPath ?? null, 'w500') : null;
    const seat = seatLabel(ticket?.seat);

    return (
      <article className="relative w-full max-w-[24rem] overflow-hidden rounded-2xl bg-surface-high shadow-elev-2">
        <div className="relative min-h-[22rem]">
          {poster ? (
            <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-surface-top" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/60 to-black/92" />
          <div className="relative z-10 grid justify-items-center gap-3 px-5 pt-6 pb-5">
            <Link
              to="/events"
              className="font-extrabold tracking-tight text-white hover:text-white"
            >
              Elite Eventos
            </Link>
            {missing ? (
              <h1 className="m-0 text-center text-2xl font-extrabold tracking-tight text-white">
                Ingresso não encontrado.
              </h1>
            ) : (
              <>
                <h1 className="m-0 text-2xl font-extrabold tracking-tight text-white">
                  Assento {seat}
                </h1>
                <span className={used ? badgeUsed : badgeOk}>
                  {used ? null : <CheckIcon size={14} strokeWidth={2.5} />}
                  {TICKET_STATUS_LABEL[ticket.status]}
                </span>
                <TicketQr code={ticket.code} used={used} />
                <p className="m-0 max-w-full text-center font-mono text-[2.15rem] leading-none font-extrabold tracking-[0.18em] text-white select-all tabular-nums">
                  {formatTicketPin(ticket.pin)}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="relative bg-surface-high" aria-hidden="true">
          <span className="absolute top-1/2 left-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas" />
          <span className="absolute top-1/2 right-0 size-5 translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas" />
          <div className="mx-6 border-t border-dashed border-line-strong" />
        </div>

        <dl className="grid gap-2 px-5 py-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="m-0 text-faint">Título</dt>
            <dd className="m-0 font-semibold text-ink">{missing ? '—' : (ticket.event?.title ?? '—')}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="m-0 text-faint">Sessão</dt>
            <dd className="m-0 font-semibold text-ink">
              {missing || !ticket.event?.startsAt ? '—' : formatSessionWhen(ticket.event.startsAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="m-0 text-faint">Assento</dt>
            <dd className="m-0 font-semibold text-ink">{missing ? '—' : `Assento ${seat}`}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="m-0 text-faint">Status</dt>
            <dd className="m-0 font-semibold text-ink">
              {missing ? '—' : TICKET_STATUS_LABEL[ticket.status]}
            </dd>
          </div>
        </dl>
      </article>
    );
  }
  ```

  Os círculos `bg-canvas` (`#070414`) furam o papel no palco escuro — é a perfuração. Sem asset.

- [ ] `TicketPassPage.tsx`:

  ```tsx
  import { useEffect, useState } from 'react';
  import { useParams } from 'react-router-dom';
  import { ApiError, getSharedTicket, type Ticket } from '../events/api';
  import { ErrorNotice } from '../chrome/states';
  import { skeleton } from '../ui';
  import { TicketPaper } from './TicketPaper';

  export function TicketPassPage() {
    const { code = '' } = useParams();
    const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      setTicket(undefined);
      setError(null);
      getSharedTicket(code)
        .then((found) => {
          if (!cancelled) setTicket(found);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 404) {
            setTicket(null);
            return;
          }
          setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o ingresso');
        });
      return () => {
        cancelled = true;
      };
    }, [code]);

    return (
      <div className="flex min-h-dvh items-center justify-center bg-page p-4">
        {error ? (
          <ErrorNotice message={error} onRetry={() => setTicket(undefined)} />
        ) : ticket === undefined ? (
          <div className={`${skeleton} h-[32rem] w-full max-w-[24rem]`} aria-label="Carregando ingresso" />
        ) : (
          <TicketPaper ticket={ticket} />
        )}
      </div>
    );
  }
  ```

  404 → `ticket === null` → fantasma. 5xx → `ErrorNotice`, **não** fantasma. Retry: o `useEffect` depende de `code`; para retry, usar um `attempt` counter (igual `TicketsPage`) em vez de `setTicket(undefined)` sozinho — senão o effect não dispara de novo.

  Corrigir o retry **antes** de commitar a página:

  ```tsx
  const [attempt, setAttempt] = useState(0);
  // effect deps: [code, attempt]
  // ErrorNotice onRetry={() => { setError(null); setAttempt((n) => n + 1); }}
  ```

- [ ] `App.tsx` — irmão de `/login`, **fora** do Shell:

  ```tsx
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/t/:code" element={<TicketPassPage />} />
    <Route element={<Shell />}>
      {/* rotas atuais intactas */}
    </Route>
  </Routes>
  ```

- [ ] `TicketPassPage.test.tsx` — `MemoryRouter` + `App` (para garantir ausência de tab bar). Fixture igual ao `ticketsFixture[0]` de `TicketsPage.test.tsx`.

  ```ts
  function renderPass(code = 't1.sig') {
    return render(
      <MemoryRouter initialEntries={[`/t/${code}`]}>
        <App />
      </MemoryRouter>,
    );
  }
  ```

  Fetch mock: se `url.includes('/tickets/pass/')` → 200 `{ ticket }` ou 404. **Não** mandar Bearer no assert: `new Headers(init?.headers).get('Authorization')` deve ser `null`.

  Casos:
  1. 200 UNUSED: heading `Assento A1`; texto `384 291`; título `Duna` no talão; link `Elite Eventos` → `/events`; `queryByRole('link', { name: 'Eventos' })` **null** (sem tab bar); `queryByRole('link', { name: /Entrar/ })` **null**.
  2. 200 USED: badge `Usado`; PIN visível; overlay do QR (o `img` do QR pode ser async — assert pelo badge e pelo PIN).
  3. 404: heading `Ingresso não encontrado.`; `queryByText(/384/)` null; talão com `—`; mesmo link da marca.
  4. HMAC lixo e 404 usam o **mesmo** heading (não ramificar copy).
  5. Visitante (sem `localStorage`) consegue abrir — não redireciona para `/login`.

- [ ] Rodar em `web/`:

  ```
  npx vitest run src/tickets/TicketPassPage.test.tsx src/tickets/TicketsPage.test.tsx src/App.test.tsx
  ```

  Esperar todos pass. `TicketsPage.test` continua achando o dialog e `384 291` depois do extract do `TicketQr`.

---

### Task 6: botão Compartilhar no modal

**Files:**
- Modify: `web/src/icons.tsx` (depois de `CloseIcon`, ~linhas 96–102)
- Modify: `web/src/tickets/TicketPassModal.tsx`
- Modify: `web/src/tickets/TicketsPage.test.tsx` (o caso “abre o passe com PIN”, ~linhas 247–278)

- [ ] `ShareIcon` no mesmo traço 1,5:

  ```tsx
  export function ShareIcon(props: IconProps) {
    return (
      <Icon {...props}>
        <path d="M12 14V4M12 4 8.5 7.5M12 4l3.5 3.5" />
        <path d="M6 10.5v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" />
      </Icon>
    );
  }
  ```

- [ ] No `TicketPassModal`, depois do copy “Mostre o QR…”, botão visível em UNUSED/USED/EXPIRED (a página compartilhada também existe nesses estados):

  ```tsx
  const [shareHint, setShareHint] = useState<string | null>(null);

  async function onShare() {
    const url = ticketShareUrl(window.location.origin, ticket.code);
    try {
      const result = await shareTicketPass(url);
      setShareHint(result === 'copied' ? 'Link copiado' : null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareHint('Não foi possível compartilhar');
    }
  }
  ```

  Markup:

  ```tsx
  <button type="button" className={`${btnGhost} min-h-11 w-full`} onClick={() => void onShare()}>
    <ShareIcon size={18} />
    Compartilhar
  </button>
  {shareHint ? <p className="m-0 text-center text-[13px] text-faint">{shareHint}</p> : null}
  ```

  Importar `btnGhost` de `../ui`.

- [ ] No teste “toque no ingresso abre o passe com PIN”, depois de abrir o dialog A1:

  ```ts
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/t/t1.sig`);
  });
  expect(await screen.findByText('Link copiado')).toBeTruthy();
  ```

  jsdom não tem `navigator.share` por default → cai no clipboard. Não mockar `share` neste teste (cobre o caminho desktop). O caminho `navigator.share` já está em `pass.test.ts`.

- [ ] Rodar `npx vitest run src/tickets/TicketsPage.test.tsx src/tickets/pass.test.ts src/tickets/TicketPassPage.test.tsx` em `web/`. Esperar todos pass.

---

### Task 7: Verificar a fatia

**Files:** nenhum código novo.

- [ ] Em `api/`: `npx vitest run` — suite verde.
- [ ] Em `web/`: `npx vitest run` — suite verde.
- [ ] Em `api/`: `npx tsc -p tsconfig.json --noEmit`.
- [ ] Em `web/`: `npx tsc -b --noEmit`.
- [ ] Checar AC do grill:
  - [ ] `/t/<code>` fora do Shell, ingresso estreito centrado
  - [ ] GET público por HMAC; 404 idêntico para lixo e id morto
  - [ ] Sem `userId` no JSON; `no-store`
  - [ ] USED/EXPIRED: 200, QR velado, PIN visível
  - [ ] GET não marca `USED`
  - [ ] Lazy `EXPIRED`
  - [ ] Compartilhar só no modal; URL = origin + `/t/` + code
  - [ ] QR da porta inalterado (`signTicketId` / `scanTicket`)
  - [ ] Marca → `/events`
- [ ] Não commitar neste turno de implementação. Parar, listar arquivos, esperar revisão.

---

## Mapa requisito → task

| AC (grill) | Task |
|---|---|
| Capability URL com QR+PIN | 2, 3, 5 |
| Reusa `Ticket.code` (HMAC) | 2, 3 |
| `/t/:code` fora do Shell | 5 |
| `GET /tickets/pass/:code` público | 3 |
| Sem `userId`, `no-store` | 2, 3 |
| Papel estreito, pôster, QR, talão | 5 |
| USED/EXPIRED = carteira (QR velado) | 5 |
| 404 = mesmo papel vazio | 5 |
| Share só no modal | 6 |
| QR da porta = HMAC puro | — (não mexer) |
| Marca → `/events` | 5 |
| Lazy EXPIRED | 2, 3 |
| ADR | 1 |

`serve -s dist` (script `start` do web) já entrega `index.html` em `/t/:code` na Railway. Sem task de deploy.
