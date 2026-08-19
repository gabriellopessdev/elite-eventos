# Sessão passada + EXPIRED — Implementation Plan

**Goal:** Issue #15 — cartaz some no `startsAt`; hold/checkout recusam; `UNUSED` vira `EXPIRED` em `startsAt+3h` (lazy); porta devolve `expired`; carteira filtra Expirados.

**Architecture:** Dois relógios, um enum. Venda (`listEvents` público, `holdSeats`, `checkoutHold`) corta em `startsAt`. Scan/carteira cortam em `startsAt + SESSION_SCAN_GRACE_MS` (3h), persistindo `UNUSED→EXPIRED` no mesmo espírito de `releaseExpiredSeats`. `GET /events` continua um endpoint: janela larga só com Bearer `DOOR` válido. Assento permanece `SOLD`. Archive do org não muda.

**Branch:** `feat/session-expired` a partir de `origin/main` (`git fetch origin`; `git checkout -b feat/session-expired origin/main`).

**Fora:** cancel 7b, link #6, busca 7a, `endsAt`, job/cron, catálogo extra de org.

---

### Task 1: Schema `EXPIRED` + ADR-011

**Files:**
- Modify: `api/prisma/schema.prisma` (`enum TicketStatus` linhas 60–63)
- Create: `api/prisma/migrations/<timestamp>_ticket_expired/migration.sql` (via `prisma migrate dev`)
- Modify: `docs/DECISIONS.md` (após ADR-010)

- [ ] Em `enum TicketStatus` adicionar `EXPIRED`:

  ```prisma
  enum TicketStatus {
    UNUSED
    USED
    EXPIRED
  }
  ```

- [ ] Na pasta `api/`, se `prisma generate` der EPERM no Windows: parar `node` do repo e retry. Depois:

  ```
  npx prisma migrate dev --name ticket_expired
  ```

  Esperar migration com o equivalente a:

  ```sql
  ALTER TYPE "TicketStatus" ADD VALUE 'EXPIRED';
  ```

  (Prisma 6 pode recriar o enum; commitar o SQL gerado, não inventar outro.)

- [ ] Append **ADR-011 — Dois relógios: venda vs scan**:
  - Venda: `PUBLISHED` e `startsAt > now` no `GET /events` público; `holdSeats` / `checkoutHold` recusam se `startsAt <= now` com `HoldValidationError('Session is no longer on sale')` → **400** (não 404: `GET /events/:id` continua 200).
  - Scan: `SESSION_SCAN_GRACE_MS = 3 * 60 * 60 * 1000`. `UNUSED` cujo `startsAt + 3h <= now` vira `EXPIRED` (lazy). `USED` não muda. Assento `SOLD`.
  - `GET /events` + Bearer `DOOR` válido: `PUBLISHED` e `startsAt > now - 3h`. Token inválido/ausente/outro papel → janela de venda. Nunca 401 neste GET.
  - Scan 200 `{ outcome: 'expired' }` na ordem: `invalid` → `wrong_event` → `used` → `expired` → `valid`. PIN de outra sessão continua `invalid`.
  - Relógio ≠ archive (`ARCHIVED` ainda 404 no scan).
  - Cancel (7b) só `UNUSED` de sessão futura — fora desta fatia.

- [ ] Atualizar ADR-010: incluir `expired` no union do 200 e a nova ordem (passo `EXPIRED` depois de `USED`).

- [ ] Rodar `npx prisma generate` em `api/`. Esperar cliente com `TicketStatus.EXPIRED`.

---

### Task 2: Janela da sessão + `listEvents`

**Files:**
- Create: `api/src/events/session-window.ts`
- Modify: `api/src/events/repo.ts` (`listEvents` linhas 103–109)
- Create: `api/tests/session-window.test.ts`

- [ ] Criar `api/src/events/session-window.ts`:

  ```ts
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
  ```

- [ ] Trocar `listEvents` em `api/src/events/repo.ts`:

  ```ts
  import { listStartsAfter } from './session-window.js';

  export async function listEvents(opts?: { now?: Date; includeStarted?: boolean }) {
    const now = opts?.now ?? new Date();
    return prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        startsAt: { gt: listStartsAfter(now, Boolean(opts?.includeStarted)) },
      },
      orderBy: { startsAt: 'asc' },
    });
  }
  ```

  `listEvents()` sem args (hold-repo e callers atuais) = catálogo de venda.

- [ ] Criar `api/tests/session-window.test.ts` — users `expire-repo-org@elite.local` (nunca `org@elite.local`). `ticket.deleteMany` antes de `event.deleteMany`. Datas **relativas a `Date.now()`** (ISO fixo em 2026 apodrece).

  ```ts
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1000);
  const started = new Date(now.getTime() - 60 * 1000); // 1 min ago — still in scan window
  const expired = new Date(now.getTime() - SESSION_SCAN_GRACE_MS - 60 * 1000);
  ```

  Asserts:
  - `listEvents({ now })` contém `future`, omite `started` e `expired`.
  - `listEvents({ now, includeStarted: true })` contém `future` e `started`, omite `expired`.
  - `saleOpen(started)` false; `scanOpen(started)` true; `scanOpen(expired)` false.

- [ ] Rodar `npx vitest run tests/session-window.test.ts` em `api/`. Esperar todos pass.

---

### Task 3: Hold e checkout recusam depois do `startsAt`

**Files:**
- Modify: `api/src/events/repo.ts` (`holdSeats` ~151–165; `checkoutHold` ~247–262)
- Modify: `api/src/events/routes.ts` (`POST /hold` catch de `HoldValidationError` ~184–188; `POST /checkout` já mapeia qualquer `HoldValidationError` para 400)
- Modify: `api/tests/hold-repo.test.ts`
- Modify: `api/tests/hold.test.ts`
- Modify: `api/tests/checkout.test.ts`

- [ ] Em `holdSeats`, depois do check `PUBLISHED`:

  ```ts
  import { saleOpen } from './session-window.js';

  if (!saleOpen(event.startsAt)) {
    throw new HoldValidationError('Session is no longer on sale');
  }
  ```

  Não reusar `'Event not found or not published'` — essa mensagem vira **404**. Sessão passada existe.

- [ ] Em `checkoutHold`, depois de `releaseExpiredSeats()`, carregar o evento e recusar venda fechada **antes** do random 25%:

  ```ts
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.status !== EventStatus.PUBLISHED) {
    throw new HoldValidationError('No active hold for this event');
  }
  if (!saleOpen(event.startsAt)) {
    throw new HoldValidationError('Session is no longer on sale');
  }
  ```

  Hold já aberto **não** é liberado aqui — cai no TTL (`releaseExpiredSeats`).

- [ ] No catch de `POST /events/:id/hold` em `routes.ts`, manter o 404 só para unpublished. `'Session is no longer on sale'` cai no `return reply.code(400)`.

- [ ] Teste repo (`hold-repo.test.ts`): `createEvent` com `startsAt: new Date(Date.now() - 60_000)`; `holdSeats` lança `HoldValidationError` com essa mensagem; assento continua `AVAILABLE`.

- [ ] Teste HTTP (`hold.test.ts`): criar sessão futura, `prisma.event.update({ data: { startsAt: new Date(Date.now() - 60_000) } })`, `POST /hold` → 400 `{ message: 'Session is no longer on sale' }`.

- [ ] Teste HTTP (`checkout.test.ts`): hold ok em sessão futura; backdate `startsAt`; `POST /checkout` → 400 mesma mensagem; assentos ainda `HELD`; nenhum `Ticket`. Spy de `Math.random` **não** deve ser necessário (recusa de venda vem antes do 25%).

- [ ] `GET /events/:id` de sessão com `startsAt` no passado continua **200** (não 404). Encerrar (`POST /archive`) continua independente. Cobrir no teste HTTP de hold: GET 200 + archive 200.

- [ ] Rodar `npx vitest run tests/hold-repo.test.ts tests/hold.test.ts tests/checkout.test.ts` em `api/`. Esperar todos pass.

---

### Task 4: Lazy `EXPIRED` + ordem do scan

**Files:**
- Modify: `api/src/tickets/repo.ts`
- Modify: `api/src/events/repo.ts` (`getPublishedEvent` ~216–224)
- Modify: `api/tests/scan-repo.test.ts`
- Create: `api/tests/expire-tickets.test.ts`

- [ ] Em `api/src/tickets/repo.ts`:

  ```ts
  import { SESSION_SCAN_GRACE_MS } from '../events/session-window.js';

  export type ScanOutcome = 'valid' | 'invalid' | 'used' | 'wrong_event' | 'expired';

  export async function expireTicketsPastWindow(now = new Date()) {
    const cutoff = new Date(now.getTime() - SESSION_SCAN_GRACE_MS);
    return prisma.ticket.updateMany({
      where: {
        status: TicketStatus.UNUSED,
        event: { startsAt: { lte: cutoff } },
      },
      data: { status: TicketStatus.EXPIRED },
    });
  }
  ```

  Não mexer em `Seat`. `USED` fica fora do `where`.

- [ ] `listTicketsForUser`: `await expireTicketsPastWindow()` **antes** do `findMany`.

- [ ] `scanTicket`: `await expireTicketsPastWindow()` no início (depois do trim, **antes** do lookup). Assim o row já está `EXPIRED` quando `consumeScannedTicket` lê o status.

- [ ] `consumeScannedTicket`:

  ```ts
  async function consumeScannedTicket(ticket: TicketWithSeat): Promise<ScanResult> {
    if (ticket.status === TicketStatus.USED) return { outcome: 'used' };
    if (ticket.status === TicketStatus.EXPIRED) return { outcome: 'expired' };

    const updated = await prisma.ticket.updateMany({
      where: { id: ticket.id, eventId: ticket.eventId, status: TicketStatus.UNUSED },
      data: { status: TicketStatus.USED },
    });
    if (updated.count !== 1) {
      const latest = await prisma.ticket.findUnique({ where: { id: ticket.id } });
      if (latest?.status === TicketStatus.EXPIRED) return { outcome: 'expired' };
      return { outcome: 'used' };
    }

    return {
      outcome: 'valid',
      seat: { row: ticket.seat.row, number: ticket.seat.number },
    };
  }
  ```

  HMAC de outra sessão continua `wrong_event` **antes** de `consumeScannedTicket` (mesmo `EXPIRED`/`USED`). PIN ausente neste `eventId` continua `invalid`.

- [ ] `getPublishedEvent`: depois de `releaseExpiredSeats()`, `await expireTicketsPastWindow()`. Importar de `../tickets/repo.js` — `events/repo.ts` hoje **não** importa `tickets/repo.ts`, então não há ciclo (`tickets/repo` só importa `session-window.ts`).

- [ ] `api/tests/expire-tickets.test.ts` — emails `expire-tickets-org@` / `expire-tickets-cli@`. Seed sessão `startsAt = now - SESSION_SCAN_GRACE_MS - 60_000`, ticket `UNUSED`, assento `SOLD`. Chamar `expireTicketsPastWindow()`. Assert ticket `EXPIRED`, seat `SOLD`. Segundo ticket `USED` na mesma sessão permanece `USED`. `listTicketsForUser` dispara a lazy e devolve `status: 'EXPIRED'`.

- [ ] Em `scan-repo.test.ts`, helper `seedSession` aceitar `startsAt`. Casos novos:
  1. Sessão com `startsAt` fora da janela, ticket `UNUSED`, HMAC → `{ outcome: 'expired' }`; status no DB `EXPIRED`; seat `SOLD`.
  2. Mesmo setup, ticket já `USED` → `{ outcome: 'used' }` (não vira `EXPIRED`).
  3. PIN de 6 dígitos na sessão expirada → `expired`.
  4. HMAC de sessão B (expirada) scaneado na sessão A (futura) → `wrong_event`.
  5. PIN de sessão B na sessão A → `invalid`.
  6. Sessão começou há 1 min (`scanOpen` true), `UNUSED` → `valid` e vira `USED`.

- [ ] Rodar `npx vitest run tests/expire-tickets.test.ts tests/scan-repo.test.ts` em `api/`. Esperar todos pass.

---

### Task 5: HTTP — `GET /events` por papel + scan `expired`

**Files:**
- Modify: `api/src/events/routes.ts` (`GET /events` linhas 106–109; `tryCustomerAuth` ~91–103)
- Modify: `api/tests/scan.test.ts`
- Create: `api/tests/session-list.test.ts`

- [ ] Ao lado de `tryCustomerAuth`, adicionar `tryDoorAuth` idêntico com `claims.role !== Role.DOOR → null`. Token lixo → `null` (GET público não 401).

- [ ] Trocar o handler:

  ```ts
  app.get('/events', async (request) => {
    const door = await tryDoorAuth(request);
    const events = await listEvents({ includeStarted: Boolean(door) });
    return { events };
  });
  ```

- [ ] `api/tests/session-list.test.ts` — emails `expire-http-org@elite.local`, `expire-http-door@elite.local`, `expire-http-cli@elite.local` (não reusar seed). Criar 3 sessões via POST e backdate com `prisma.event.update`:
  - futura
  - `startsAt = now - 60_000` (em andamento)
  - `startsAt = now - SESSION_SCAN_GRACE_MS - 60_000` (janela fechada)

  Asserts:
  - `GET /events` sem token: só futura.
  - `GET /events` Bearer customer: só futura.
  - `GET /events` Bearer door: futura + em andamento; omite janela fechada.
  - Bearer door inválido: só futura (não 401).
  - `GET /events/:id` da em andamento: 200.

- [ ] Em `scan.test.ts`, após criar sessão: `prisma.event.update({ data: { startsAt: new Date(Date.now() - SESSION_SCAN_GRACE_MS - 60_000) } })`; emitir ticket `UNUSED`; `POST /scan` door + HMAC → 200 `{ outcome: 'expired' }`. Repetir com PIN. Ticket `USED` na mesma sessão → `{ outcome: 'used' }`.

- [ ] Rodar `npx vitest run tests/session-list.test.ts tests/scan.test.ts tests/events.test.ts` em `api/`. Esperar todos pass. `events.test.ts` usa `startsAt` em 2026-10-01 (ainda futuro em 2026-08-18); não reescrever esses ISO.

---

### Task 6: Web — cartaz, sessão, porta, carteira

**Files:**
- Modify: `web/src/events/api.ts` (`Ticket.status` linha 40; `ScanOutcome` linha 54; `listEvents` linhas 99–109)
- Modify: `web/src/door/DoorPage.tsx` (`outcomeCopy` / `outcomeTone` / `listEvents()` no effect ~135–138)
- Modify: `web/src/door/DoorPage.test.tsx`
- Modify: `web/src/events/EventPage.tsx` (`SeatMap` ~85; pill ~420; rodapé ~460)
- Modify: `web/src/events/EventPage.test.tsx`
- Modify: `web/src/tickets/TicketsPage.tsx` (`STATUS_FILTERS` linhas 21–25)
- Modify: `web/src/tickets/TicketStubbook.tsx` (`statusLabel` e `used`)
- Modify: `web/src/tickets/TicketPassModal.tsx` (`statusLabel` e `used`)
- Modify: `web/src/tickets/TicketsPage.test.tsx`

- [ ] Tipos em `web/src/events/api.ts`:

  ```ts
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  export type ScanOutcome = 'valid' | 'invalid' | 'used' | 'wrong_event' | 'expired';
  ```

  `listEvents` passa Bearer opcional (porta precisa; cartaz não):

  ```ts
  export async function listEvents(accessToken?: string | null): Promise<EventSummary[]> {
    const res = await apiFetch('/events', {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    // resto igual
  }
  ```

- [ ] `DoorPage.tsx`: `listEvents(session.accessToken)`. Em `outcomeCopy`, `case 'expired': return 'Expirado'`. `outcomeTone.expired` e `outcomeDot.expired` iguais a `used` (`bg-warn`). `OutcomeIcon`: `expired` usa `ClockIcon` como `used`.

- [ ] `DoorPage.test.tsx`: copiar o teste de “Já utilizado”; mock `{ outcome: 'expired' }` → texto `Expirado`.

- [ ] `EventPage.tsx`: `const onSale = new Date(event.startsAt).getTime() > Date.now()`.
  - Pill: `onSale ? 'Em cartaz' : 'Fora de venda'`.
  - `SeatMap`: nova prop `interactive` (default `true`). Se `false`, todo assento é `<span>` (mesmo AVAILABLE); caption `Mapa da sessão` em vez de `Selecione os assentos`.
  - Se `!onSale`: não renderizar o `<div className="fixed inset-x-0 bottom-...">` do rodapé Reservar e pagar. Org ainda vê Encerrar.
  - Não chamar `holdSeats` se `!onSale`.

- [ ] `EventPage.test.tsx`: fixture com `startsAt: '2020-01-01T20:00:00.000Z'`. Assert: texto `Fora de venda`; `queryByRole('button', { name: 'Reservar e pagar' })` null; assento AVAILABLE **não** é `button`. Org nessa URL ainda vê `Encerrar sessão`.

- [ ] `TicketsPage.tsx` chips:

  ```ts
  { value: 'UNUSED', label: 'Não usados' },
  { value: 'USED', label: 'Usados' },
  { value: 'EXPIRED', label: 'Expirados' },
  ```

  `Todos` já inclui os três (`statusFilter === 'ALL'`).

- [ ] `TicketStubbook.tsx` e `TicketPassModal.tsx`:

  ```ts
  const statusLabel: Record<Ticket['status'], string> = {
    UNUSED: 'Não usado',
    USED: 'Usado',
    EXPIRED: 'Expirado',
  };
  const used = ticket.status === 'USED' || ticket.status === 'EXPIRED';
  ```

  QR velado e `badgeUsed` nos dois estados. Sem ícone Check no badge expirado/usado.

- [ ] `TicketsPage.test.tsx`: terceiro ingresso `status: 'EXPIRED'`. Clicar chip `Expirados` → só esse visível; `Não usados` o esconde. Badge `Expirado` no DOM.

- [ ] Rodar em `web/`:

  ```
  npx vitest run src/door/DoorPage.test.tsx src/events/EventPage.test.tsx src/tickets/TicketsPage.test.tsx src/events/EventsPage.test.tsx
  ```

  Esperar todos pass. `EventsPage` continua `listEvents()` sem token.

---

### Task 7: Verificar a fatia

**Files:** nenhum código novo.

- [ ] Em `api/`: `npx vitest run` — suite verde.
- [ ] Em `web/`: `npx vitest run` — suite verde.
- [ ] Em `api/`: `npx tsc -p tsconfig.json --noEmit`.
- [ ] Em `web/`: `npx tsc -b --noEmit`.
- [ ] Checar AC da #15:
  - [ ] Cartaz omite `startsAt` passado
  - [ ] URL da sessão passada: 200, sem compra/hold
  - [ ] Lazy `UNUSED→EXPIRED` em `startsAt+3h`; assento `SOLD`
  - [ ] Scan `expired` vs `used` vs `invalid` vs `wrong_event`
  - [ ] Carteira chip + badge Expirado; QR velado
  - [ ] Archive independente
- [ ] Não commitar neste turno de implementação. Parar, listar arquivos, esperar revisão.

---

## Mapa requisito → task

| AC #15 | Task |
|---|---|
| Cartaz sem sessão passada | 2, 5 |
| URL visível, sem compra/hold | 3, 6 |
| Lazy EXPIRED; seat SOLD | 4 |
| Scan `expired` / `used` | 4, 5, 6 |
| Carteira badge + filtro | 4, 6 |
| Archive ≠ relógio | 3, 5 |
| Testes de domínio | 2, 3, 4, 5, 6 |

O texto original da issue dizia “UNUSED depois do horário”. A direção aprovada no grill é **`startsAt + 3h`**, não o instante do `startsAt`.
