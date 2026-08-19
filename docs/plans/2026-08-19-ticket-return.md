# Devolver ingresso (cancel 7b) — Implementation Plan

**Goal:** O cliente devolve um `UNUSED` de sessão futura: `DELETE /tickets/:id` apaga a linha, o assento volta `AVAILABLE`, a carteira some o talão em silêncio.

**Architecture:** Sem coluna `CANCELED` e sem estorno — o checkout do MVP é simulado (ADR-013). `returnTicket` corre numa transação: `deleteMany` só se dono + `UNUSED` + `event.startsAt > now`; depois o assento `AVAILABLE`. Corrida com a porta: quem perder o `UNUSED` vê 409. UI: botão só no `TicketPassModal` (não na lista, não em `/t/:code`) + `ConfirmDialog` já usado no Encerrar.

**Branch:** `feat/ticket-cancel` a partir de `origin/main` **depois** do share (#6 / ADR-012) merged. Não empilhar em working tree sujo do `feat/ticket-share`. `git fetch origin && git checkout -b feat/ticket-cancel origin/main`.

**Fora:** polling (#8), busca, painel org, status `CANCELED`, PIX/estorno, botão na listagem, Devolver em `/t/:code`, migration Prisma.

---

### Task 1: ADR-013 + ROADMAP

**Files:**
- Modify: `docs/DECISIONS.md` (após ADR-012, hoje termina ~linha 123)
- Modify: `docs/ROADMAP.md` (linhas 13–16)

- [ ] Append **ADR-013 — Devolver ingresso apaga a linha**:

  ```md
  ## ADR-013 — Devolver ingresso apaga a linha

  **Status:** accepted
  **Contexto:** fatia 7b em `feat/ticket-cancel` (2026-08-19). Cliente precisa devolver um assento ao mapa. Não há pedido, gateway nem saldo — o checkout é 25% simulado (ADR-009).
  **Decisão:**
  - Cancelar = **apagar** o `Ticket` + assento `AVAILABLE` na mesma transação. Sem enum `CANCELED`, sem `seatId` opcional, sem estorno.
  - Se o MVP tivesse pagamento de verdade, esta fatia seria cancelamento **e** devolução do dinheiro. Não é o caso: o único efeito real é estoque.
  - Quem: só `CUSTOMER` dono. Org continua só com Encerrar (archive); archive não devolve `SOLD`.
  - Quando: `UNUSED` e `startsAt > now`. Sessão já começou → **409** (o ingresso segue até `USED`/`EXPIRED`). `ARCHIVED` **não** bloqueia (scan de arquivada já é 404).
  - HTTP: `DELETE /tickets/:id`, `requireRole(CUSTOMER)`. **204** vazio. Não é dono / id morto → **404** `{ message: 'Ticket not found' }` idênticos. `USED` / `EXPIRED` / sessão passada / corrida com scan → **409** `{ message: 'Ticket cannot be returned' }`.
  - Atômico: `deleteMany` `UNUSED` + dono + `startsAt > now`; `count !== 1` → 409. Só então `Seat` `AVAILABLE`.
  - Web: botão **Devolver ingresso** só no modal do passe da carteira, só se `canReturnTicket`. `ConfirmDialog`: “Devolver este ingresso?” / “O assento volta ao mapa. Esta ação não pode ser desfeita.” / Devolver ingresso / Manter ingresso. 204 ou 404 → fecha e a lista some sozinha (`GET /tickets`). 409 → alerta no passe. `/t/:code` sem Devolver. Sem toast.
  **Consequências:** HMAC/PIN mortos caem em 404/`invalid` (não vazam “cancelado”). Checkout pode emitir ingresso novo no mesmo assento. Polling do mapa é a fatia seguinte.
  **Alternativas:** status `CANCELED` + `seatId` nullable (rejeitado — audit de dinheiro que não existe); estorno (rejeitado — sem pagamento); botão na listagem (rejeitado — botão aninhado no talão).
  ```

- [ ] Em `docs/ROADMAP.md`:
  - Fatia 6: se o share já estiver merged nesta branch, marcar `✅`; senão deixar `⬜` — esta fatia **não** implementa o link.
  - Fatia 7: texto **Cancelamento+estoque**; Done “cliente devolve UNUSED futuro — em `feat/ticket-cancel`. Busca e painel org: depois do #8.”
  - Fatia 8: intacta (polling, fatia seguinte). Não juntar 7 com 8.

---

### Task 2: `returnTicket` no repo

**Files:**
- Modify: `api/src/tickets/repo.ts` (depois de `getTicketByShareCode`)
- Create: `api/tests/cancel-repo.test.ts`

- [ ] Em `api/tests/cancel-repo.test.ts` — e-mails `cancel-repo-org@elite.local` / `cancel-repo-cli@elite.local` (nunca `org@elite.local`). `ticket.deleteMany` antes de `event.deleteMany`. Datas relativas a `Date.now()`.

  ```ts
  import { randomUUID } from 'node:crypto';
  import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
  import { EventStatus, Role, SeatStatus, TicketStatus } from '@prisma/client';
  import { prisma } from '../src/db.js';
  import { hashPassword } from '../src/auth/password.js';
  import { checkoutHold, createEvent, holdSeats } from '../src/events/repo.js';
  import { SESSION_SCAN_GRACE_MS } from '../src/events/session-window.js';
  import { signTicketId } from '../src/tickets/qr.js';
  import { randomTicketPin } from '../src/tickets/pin.js';
  import {
    returnTicket,
    scanTicket,
    TicketReturnConflictError,
    TicketReturnNotFoundError,
  } from '../src/tickets/repo.js';

  process.env.JWT_SECRET ??= 'test-jwt-secret-elite-eventos';
  process.env.QR_HMAC_SECRET ??= 'test-qr-hmac-secret';

  describe('tickets/repo returnTicket', () => {
    let organizerId: string;
    let customerId: string;

    beforeAll(async () => {
      const passwordHash = await hashPassword('cancel-repo-test');
      const org = await prisma.user.upsert({
        where: { email: 'cancel-repo-org@elite.local' },
        create: {
          email: 'cancel-repo-org@elite.local',
          passwordHash,
          name: 'Cancel Repo Org',
          role: Role.ORGANIZER,
        },
        update: { passwordHash },
      });
      const customer = await prisma.user.upsert({
        where: { email: 'cancel-repo-cli@elite.local' },
        create: {
          email: 'cancel-repo-cli@elite.local',
          passwordHash,
          name: 'Cancel Repo Cli',
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
      userId = customerId,
    }: {
      eventId: string;
      seatId: string;
      status?: TicketStatus;
      userId?: string;
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
          userId,
          code,
          pin: randomTicketPin(),
          status,
        },
      });
    }

    test('UNUSED futuro: apaga ticket, assento AVAILABLE; checkout no mesmo assento emite outro', async () => {
      const event = await seedFutureSession('Cancel ok');
      const seatId = event.seats[0]!.id;
      const issued = await issueTicket({ eventId: event.id, seatId });

      await returnTicket({ ticketId: issued.id, userId: customerId });

      expect(await prisma.ticket.findUnique({ where: { id: issued.id } })).toBeNull();
      expect(await prisma.seat.findUniqueOrThrow({ where: { id: seatId } })).toMatchObject({
        status: SeatStatus.AVAILABLE,
        heldById: null,
      });

      await holdSeats({ eventId: event.id, userId: customerId, seatIds: [seatId] });
      const sold = await checkoutHold({ eventId: event.id, userId: customerId, random: () => 0.9 });
      expect(sold).toHaveLength(1);
      expect(sold[0]!.id).not.toBe(issued.id);
      expect(sold[0]!.seatId).toBe(seatId);
    });

    test('não é dono / id inexistente → TicketReturnNotFoundError; linha intacta', async () => {
      const event = await seedFutureSession('Cancel 404');
      const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });

      await expect(
        returnTicket({ ticketId: issued.id, userId: organizerId }),
      ).rejects.toBeInstanceOf(TicketReturnNotFoundError);
      await expect(
        returnTicket({ ticketId: randomUUID(), userId: customerId }),
      ).rejects.toBeInstanceOf(TicketReturnNotFoundError);

      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: issued.id } })).toMatchObject({
        status: TicketStatus.UNUSED,
      });
    });

    test('USED, EXPIRED e startsAt passado → TicketReturnConflictError; assento SOLD', async () => {
      const event = await seedFutureSession('Cancel 409');
      const used = await issueTicket({
        eventId: event.id,
        seatId: event.seats[0]!.id,
        status: TicketStatus.USED,
      });
      const expired = await issueTicket({
        eventId: event.id,
        seatId: event.seats[1]!.id,
        status: TicketStatus.EXPIRED,
      });
      const future = await issueTicket({ eventId: event.id, seatId: event.seats[2]!.id });

      await expect(
        returnTicket({ ticketId: used.id, userId: customerId }),
      ).rejects.toBeInstanceOf(TicketReturnConflictError);
      await expect(
        returnTicket({ ticketId: expired.id, userId: customerId }),
      ).rejects.toBeInstanceOf(TicketReturnConflictError);
      await expect(
        returnTicket({
          ticketId: future.id,
          userId: customerId,
          now: new Date(event.startsAt.getTime() + 1000),
        }),
      ).rejects.toBeInstanceOf(TicketReturnConflictError);

      expect(await prisma.seat.findUniqueOrThrow({ where: { id: event.seats[0]!.id } })).toMatchObject({
        status: SeatStatus.SOLD,
      });
      expect(await prisma.ticket.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({
        status: TicketStatus.UNUSED,
      });
    });

    test('ARCHIVED futuro ainda devolve; HMAC morto → scan invalid', async () => {
      const event = await seedFutureSession('Cancel archive');
      const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
      await prisma.event.update({
        where: { id: event.id },
        data: { status: EventStatus.ARCHIVED },
      });

      await returnTicket({ ticketId: issued.id, userId: customerId });
      expect(await prisma.ticket.findUnique({ where: { id: issued.id } })).toBeNull();

      const scanned = await scanTicket({ eventId: event.id, code: issued.code });
      expect(scanned.outcome).toBe('invalid');
    });

    test('segundo return do mesmo id → TicketReturnNotFoundError', async () => {
      const event = await seedFutureSession('Cancel twice');
      const issued = await issueTicket({ eventId: event.id, seatId: event.seats[0]!.id });
      await returnTicket({ ticketId: issued.id, userId: customerId });
      await expect(
        returnTicket({ ticketId: issued.id, userId: customerId }),
      ).rejects.toBeInstanceOf(TicketReturnNotFoundError);
    });
  });
  ```

  O teste `ARCHIVED` usa `prisma.event.update` direto (não `archiveEvent`) para não depender de liberar HELD. `scanTicket` em evento arquivado: `getEvent` HTTP 404, mas o repo `scanTicket` não checa `Event.status` — HMAC de ticket apagado → `invalid`. É o assert certo para o código morto.

- [ ] Rodar `npx vitest run tests/cancel-repo.test.ts` em `api/`. Esperar **falha** (`returnTicket` não existe).

- [ ] Em `api/src/tickets/repo.ts`: importar `SeatStatus`. Depois de `getTicketByShareCode`:

  ```ts
  export class TicketReturnNotFoundError extends Error {
    constructor() {
      super('Ticket not found');
      this.name = 'TicketReturnNotFoundError';
    }
  }

  export class TicketReturnConflictError extends Error {
    constructor() {
      super('Ticket cannot be returned');
      this.name = 'TicketReturnConflictError';
    }
  }

  export async function returnTicket({
    ticketId,
    userId,
    now = new Date(),
  }: {
    ticketId: string;
    userId: string;
    now?: Date;
  }) {
    await expireTicketsPastWindow(now);

    return prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { event: { select: { startsAt: true } } },
      });

      if (!ticket || ticket.userId !== userId) {
        throw new TicketReturnNotFoundError();
      }

      if (ticket.status !== TicketStatus.UNUSED || ticket.event.startsAt.getTime() <= now.getTime()) {
        throw new TicketReturnConflictError();
      }

      const deleted = await tx.ticket.deleteMany({
        where: {
          id: ticketId,
          userId,
          status: TicketStatus.UNUSED,
          event: { startsAt: { gt: now } },
        },
      });
      if (deleted.count !== 1) {
        throw new TicketReturnConflictError();
      }

      await tx.seat.update({
        where: { id: ticket.seatId },
        data: {
          status: SeatStatus.AVAILABLE,
          heldById: null,
          heldUntil: null,
        },
      });
    });
  }
  ```

  Apagar o ticket **antes** do `seat.update` (`Ticket.seatId` é `onDelete: Restrict` no sentido Seat→Ticket: a linha do ingresso precisa sumir para o unique `seatId` liberar o próximo checkout). Não criar enum novo.

- [ ] Rodar `npx vitest run tests/cancel-repo.test.ts` em `api/`. Esperar todos pass.

---

### Task 3: `DELETE /tickets/:id`

**Files:**
- Modify: `api/src/tickets/routes.ts` (arquivo inteiro hoje, linhas 1–28)
- Create: `api/tests/cancel.test.ts`

- [ ] Em `api/src/tickets/routes.ts`:

  ```ts
  import type { FastifyInstance } from 'fastify';
  import { Role } from '@prisma/client';
  import { requireRole } from '../auth/require-auth.js';
  import {
    getTicketByShareCode,
    listTicketsForUser,
    returnTicket,
    TicketReturnConflictError,
    TicketReturnNotFoundError,
  } from './repo.js';

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

    app.delete('/tickets/:id', { preHandler: requireRole(Role.CUSTOMER) }, async (request, reply) => {
      const userId = request.auth?.sub;
      if (!userId) {
        return reply.code(401).send({ message: 'Missing bearer token' });
      }

      const { id } = request.params as { id: string };

      try {
        await returnTicket({ ticketId: id, userId });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof TicketReturnNotFoundError) {
          return reply.code(404).send({ message: 'Ticket not found' });
        }
        if (err instanceof TicketReturnConflictError) {
          return reply.code(409).send({ message: 'Ticket cannot be returned' });
        }
        throw err;
      }
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

  CORS já inclui `DELETE` em `api/src/app.ts`. Não mexer. `GET /tickets/pass/:code` continua público e acima.

- [ ] Em `api/tests/cancel.test.ts` — e-mails `cancel-http-org@elite.local` / `cancel-http-cli@elite.local` / `cancel-http-cli2@elite.local`. Bootstrap igual `share.test.ts` (`buildApp`, `inject` login, `createEvent` via `POST /events`). `Math.random` spy `0.9` no checkout. `startsAt` relativo: `new Date(Date.now() + 60 * 60 * 1000).toISOString()`.

  Helpers:

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
        title: 'Duna Cancel',
        posterPath: '/dune-cancel.jpg',
        startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        priceCents: 4000,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; seats: Array<{ id: string }> };
  }

  async function issueViaCheckout(eventId: string, seatIds: string[], token = customerToken) {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/events/${eventId}/hold`,
          headers: { authorization: `Bearer ${token}` },
          payload: { seatIds },
        })
      ).statusCode,
    ).toBe(200);
    const checkout = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/checkout`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(checkout.statusCode).toBe(201);
    return checkout.json() as { tickets: Array<{ id: string; code: string; pin: string }> };
  }

  async function del(ticketId: string, token?: string) {
    return app.inject({
      method: 'DELETE',
      url: `/tickets/${ticketId}`,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }
  ```

  Asserts:
  1. Dono: `DELETE` → **204** body vazio. `GET /tickets` não inclui o id. `GET /tickets/pass/${code}` → **404**. Assento `AVAILABLE`.
  2. Sem token → **401**. Org token → **403**. Ticket intacto.
  3. Token do `cli2` no ingresso do `cli` → **404** `{ message: 'Ticket not found' }`; status no DB continua `UNUSED`.
  4. `DELETE /tickets/${randomUUID()}` → **404** mesmo body.
  5. Ticket `USED` (via `prisma.ticket.update`) → **409** `{ message: 'Ticket cannot be returned' }`; assento `SOLD`.
  6. Backdate `startsAt` para `now - 60_000` com ticket `UNUSED` → **409**; assento `SOLD`.
  7. Segundo `DELETE` do mesmo id → **404**.
  8. Depois do 204, `cli2` faz hold+checkout no mesmo `seatId` → **201**.
  9. `POST /events/:id/archive` e depois `DELETE` do UNUSED futuro → **204**.

- [ ] Rodar `npx vitest run tests/cancel.test.ts tests/share.test.ts tests/checkout.test.ts` em `api/`. Esperar todos pass.

---

### Task 4: `canReturnTicket` + `returnTicket` no client

**Files:**
- Modify: `web/src/tickets/pass.ts`
- Modify: `web/src/tickets/pass.test.ts`
- Modify: `web/src/events/api.ts` (depois de `listMyTickets`, ~linhas 193–205)

- [ ] Em `web/src/tickets/pass.ts`, depois de `seatLabel`:

  ```ts
  export function canReturnTicket(ticket: Ticket, nowMs: number) {
    if (ticket.status !== 'UNUSED') return false;
    const startsAt = ticket.event?.startsAt;
    if (!startsAt) return false;
    return new Date(startsAt).getTime() > nowMs;
  }
  ```

- [ ] Em `web/src/tickets/pass.test.ts`, acrescentar:

  ```ts
  import { canReturnTicket } from './pass';

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
  ```

  Manter os casos atuais de `ticketShareUrl` / `shareTicketPass`. Não usar `Date.now()` no render do modal — o caller passa `nowMs` (padrão `useState(() => Date.now())`, igual `EventPage`).

- [ ] Em `web/src/events/api.ts`:

  ```ts
  export async function returnTicket(ticketId: string, accessToken: string): Promise<void> {
    const res = await apiFetch(`/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    });
    if (res.status === 204 || res.status === 404) return;
    if (res.status === 409) {
      throw new ApiError('Este ingresso não pode ser devolvido.', 409);
    }
    throw new ApiError(
      await readErrorMessage(res, 'Não foi possível devolver o ingresso'),
      res.status,
    );
  }
  ```

  404 no client = sucesso (segunda aba já apagou). Não `encodeURIComponent` no id (UUID).

- [ ] Rodar `npx vitest run src/tickets/pass.test.ts` em `web/`. Esperar todos pass.

---

### Task 5: Devolver no modal do passe

**Files:**
- Modify: `web/src/chrome/ConfirmDialog.tsx` (~linha 51, `z-50` → `z-[60]`)
- Modify: `web/src/tickets/TicketPassModal.tsx`
- Modify: `web/src/tickets/TicketStubbook.tsx` (props + passar `onReturned`)
- Modify: `web/src/tickets/TicketsPage.tsx` (~linha 177)
- Modify: `web/src/tickets/TicketsPage.test.tsx` (depois do caso do Compartilhar, ~linhas 247–290)
- Modify: `web/src/tickets/TicketPassPage.test.tsx` (caso UNUSED, ~linha 73)

- [ ] `ConfirmDialog`: o overlay do passe é `z-50`. Subir o confirm para `z-[60]` para ficar por cima. Encerrar sessão não quebra (também usa este diálogo).

  ```tsx
  className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
  ```

- [ ] `TicketPassModal.tsx` — `onReturned` depois do 204/404. `useAuth` para o token. `Date.now()` só no `useState` do mount. Escape com confirm aberto **não** fecha o passe (o `ConfirmDialog` já trata Escape). Clique no overlay do passe com confirm aberto: o confirm cobre. Importar `ConfirmDialog`, `hintError`, `returnTicket`, `canReturnTicket`, `ApiError`.

  ```tsx
  import { useEffect, useRef, useState } from 'react';
  import { createPortal } from 'react-dom';
  import { ApiError, returnTicket, type Ticket } from '../events/api';
  import { useAuth } from '../auth/useAuth';
  import { ConfirmDialog } from '../chrome/ConfirmDialog';
  import { badgeOk, badgeUsed, btnGhost, hintError } from '../ui';
  import { CheckIcon, CloseIcon, ShareIcon } from '../icons';
  import { TicketQr } from './TicketQr';
  import {
    TICKET_STATUS_LABEL,
    canReturnTicket,
    formatTicketPin,
    seatLabel,
    shareTicketPass,
    ticketShareUrl,
  } from './pass';

  export type TicketPassModalProps = {
    ticket: Ticket;
    onClose: () => void;
    onReturned: () => void;
  };

  export function TicketPassModal({ ticket, onClose, onReturned }: TicketPassModalProps) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const { session } = useAuth();
    const [shareHint, setShareHint] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [returning, setReturning] = useState(false);
    const [returnError, setReturnError] = useState<string | null>(null);
    const [nowMs] = useState(() => Date.now());
    const used = ticket.status === 'USED' || ticket.status === 'EXPIRED';
    const canReturn = canReturnTicket(ticket, nowMs);
    const seat = seatLabel(ticket.seat);
    const pin = formatTicketPin(ticket.pin);

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

    async function onConfirmReturn() {
      const token = session?.accessToken;
      if (!token) return;
      setReturning(true);
      setReturnError(null);
      try {
        await returnTicket(ticket.id, token);
        setConfirmOpen(false);
        onReturned();
      } catch (err) {
        setConfirmOpen(false);
        setReturnError(
          err instanceof ApiError ? err.message : 'Não foi possível devolver o ingresso',
        );
      } finally {
        setReturning(false);
      }
    }

    useEffect(() => {
      closeRef.current?.focus();

      function onKey(event: KeyboardEvent) {
        if (event.key === 'Escape' && !confirmOpen) onClose();
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose, confirmOpen]);

    return (
      <>
        {createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="presentation"
            onClick={onClose}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ticket-pass-title"
              className="relative grid w-full max-w-sm justify-items-center gap-4 rounded-t-3xl border border-line-strong bg-surface-high px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-elev-2 sm:rounded-2xl sm:pb-6"
              onClick={(event) => event.stopPropagation()}
            >
              {/* markup atual do passe intacto até Compartilhar */}
              {canReturn ? (
                <button
                  type="button"
                  className={`${btnGhost} min-h-11 w-full`}
                  onClick={() => setConfirmOpen(true)}
                >
                  Devolver ingresso
                </button>
              ) : null}
              {returnError ? (
                <p className={`m-0 text-center ${hintError}`} role="alert">
                  {returnError}
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
        <ConfirmDialog
          open={confirmOpen}
          title="Devolver este ingresso?"
          description="O assento volta ao mapa. Esta ação não pode ser desfeita."
          confirmLabel={returning ? 'Devolvendo…' : 'Devolver ingresso'}
          cancelLabel="Manter ingresso"
          pending={returning}
          onConfirm={() => void onConfirmReturn()}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  }
  ```

  Manter o markup do QR, PIN, Compartilhar e Fechar **igual** ao arquivo atual (classes, `data-testid` do QR via `TicketQr`). O bloco acima só mostra o que entra depois do Compartilhar: não apagar o botão Compartilhar. Botão Devolver **não** vai na listagem.

  Há dois botões com nome “Devolver ingresso” quando o confirm está aberto (passe + alertdialog). Nos testes, abrir o confirm e usar `within(alertdialog)`.

- [ ] `TicketStubbook.tsx`:

  ```ts
  export type TicketStubbookProps = {
    tickets: Ticket[];
    defaultExpandedEventId?: string;
    onTicketReturned: () => void;
  };
  ```

  No modal:

  ```tsx
  {openTicket ? (
    <TicketPassModal
      ticket={openTicket}
      onClose={() => setOpenTicket(null)}
      onReturned={() => {
        setOpenTicket(null);
        onTicketReturned();
      }}
    />
  ) : null}
  ```

- [ ] `TicketsPage.tsx` — **não** chamar `retry()` (isso zera a lista e mostra skeleton). Só bump do `attempt`:

  ```tsx
  <TicketStubbook
    key={`${sessionFilter}-${statusFilter}`}
    tickets={visible}
    onTicketReturned={() => setAttempt((n) => n + 1)}
  />
  ```

- [ ] `TicketsPage.test.tsx` — no caso “toque no ingresso abre o passe com PIN”, depois do Compartilhar e **antes** de fechar A1:

  A1 (`UNUSED`, `startsAt` 2026-10-01, hoje no teste é 2026-08-19) → `canReturnTicket` true. A2 `USED` → botão ausente.

  Novo caso dedicado (não inflar o do PIN). `fetch` mock por URL:

  ```ts
  it('UNUSED futuro: Devolver no passe pede confirm e some o talão', async () => {
    seedCustomer();
    let tickets = ticketsFixture;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'DELETE' && url.includes('/tickets/t1')) {
          expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-customer');
          tickets = ticketsFixture.filter((t) => t.id !== 't1');
          return { ok: true, status: 204, json: async () => ({}) };
        }
        if (url.includes('/tickets') && method === 'GET' && !url.includes('/tickets/pass/')) {
          return { ok: true, status: 200, json: async () => ({ tickets }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );

    renderAt('/tickets');
    fireEvent.click(await screen.findByRole('button', { name: /Assento A1/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Devolver ingresso' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(screen.getByText('O assento volta ao mapa. Esta ação não pode ser desfeita.')).toBeTruthy();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Manter ingresso' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Devolver ingresso' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devolver ingresso' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.queryByRole('button', { name: /Assento A1/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Assento A2/ })).toBeTruthy();
  });

  it('USED não mostra Devolver; 409 deixa o passe aberto com alerta', async () => {
    seedCustomer();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if ((init?.method ?? 'GET').toUpperCase() === 'DELETE') {
          return {
            ok: false,
            status: 409,
            json: async () => ({ message: 'Ticket cannot be returned' }),
          };
        }
        if (url.includes('/tickets')) {
          return { ok: true, status: 200, json: async () => ({ tickets: ticketsFixture }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );

    renderAt('/tickets');
    fireEvent.click(await screen.findByRole('button', { name: /Assento A2/ }));
    expect(await screen.findByText('102 938')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Devolver ingresso' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    fireEvent.click(screen.getByRole('button', { name: /Assento A1/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Devolver ingresso' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devolver ingresso' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Este ingresso não pode ser devolvido.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Assento A1/ })).toBeTruthy();
  });
  ```

  Importar `within` de `@testing-library/react`. O caso do PIN/Compartilhar permanece; A1 agora também tem Devolver visível — o teste antigo não clica nele, continua válido.

- [ ] `TicketPassPage.test.tsx` no caso UNUSED, depois do heading:

  ```ts
  expect(screen.queryByRole('button', { name: 'Devolver ingresso' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
  ```

  `/t/:code` usa `TicketPaper`, não o modal.

- [ ] Rodar em `web/`:

  ```
  npx vitest run src/tickets/TicketsPage.test.tsx src/tickets/pass.test.ts src/tickets/TicketPassPage.test.tsx src/events/EventPage.test.tsx
  ```

  Esperar todos pass. `EventPage.test` cobre regressão do `ConfirmDialog` (Encerrar).

---

### Task 6: Verificar a fatia

**Files:** nenhum código novo.

- [ ] Em `api/`: `npx vitest run` — suite verde. Postgres em `:5433` (`docker compose up -d`). Não acoplar com `tsc` no mesmo processo.
- [ ] Em `web/`: `npx vitest run` — suite verde.
- [ ] Em `api/`: `npx tsc -p tsconfig.json --noEmit`.
- [ ] Em `web/`: `npx tsc -b --noEmit`.
- [ ] Checar AC do grill:
  - [ ] `DELETE /tickets/:id` cliente dono, 204, ticket some, assento `AVAILABLE`
  - [ ] 404 idêntico (não dono / id morto); 409 USED / EXPIRED / sessão passada / corrida
  - [ ] Sem enum `CANCELED`; ADR-013 fala checkout simulado vs estorno
  - [ ] `ARCHIVED` não bloqueia
  - [ ] Checkout no mesmo assento depois do DELETE
  - [ ] HMAC morto → pass 404 / scan invalid
  - [ ] Botão só no modal da carteira; confirm com o copy travado
  - [ ] 204 some sozinho; 409 alerta no passe; 404 client = sucesso
  - [ ] `/t/:code` sem Devolver
  - [ ] Listagem sem botão Devolver
- [ ] Não commitar neste turno de implementação. Parar, listar arquivos, esperar revisão.

---

## Mapa requisito → task

| AC (grill) | Task |
|---|---|
| Apagar linha, sem `CANCELED`, sem estorno | 1, 2 |
| ADR-013 (pagamento simulado) | 1 |
| Só cliente dono, UNUSED, `startsAt > now` | 2, 3 |
| `ARCHIVED` não bloqueia | 2, 3 |
| `DELETE /tickets/:id` 204 / 404 / 409 | 3 |
| Atômico vs porta (`deleteMany` UNUSED) | 2 |
| Assento volta; outro checkout no mesmo lugar | 2, 3 |
| `canReturnTicket` + client 404=ok | 4 |
| Botão só no modal + ConfirmDialog | 5 |
| Some sozinho; 409 no passe | 5 |
| `/t/:code` sem Devolver | 5 |
| Polling / org / busca fora | 1 (ROADMAP) |

Arquivos novos em **LF** (Prettier `--check` no Windows). Não `prettier --write` no `api.ts` inteiro só por CRLF pré-existente.
