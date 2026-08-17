# Seat hold + checkout + tickets — Implementation Plan

**Goal:** Cliente seleciona até 8 assentos, “Pagar” faz hold atômico (10 min), modal de checkout com 25% de recusa demo, sucesso emite 1 Ticket+QR por assento e redireciona a `/tickets` agrupado por evento; org pode arquivar sessão.

**Architecture:** Lock e TTL só no Postgres (`Seat.status` + `heldById`/`heldUntil`) com `UPDATE … WHERE status='AVAILABLE'` em transação. Checkout lê o hold do user, sorteia recusa no servidor, cria `Ticket` com `code = ticketId.sig` (HMAC). Front: seleção local → `POST hold` abre modal → `POST checkout` ou `DELETE hold`. Lazy release de expirados em GET evento / hold / checkout. Soft-archive (`Event.status`) some do catálogo público.

**Branch:** `feat/seat-hold`  
**Fora:** portaria UI (#5), link compartilhável (#6), painel/gráficos, Evento↔N sessões (só ADR).

---

### Task 1: Schema + ADRs + ROADMAP

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<timestamp>_hold_checkout_archive/migration.sql` (via `prisma migrate dev`)
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ROADMAP.md`

- [ ] Add to `Event`:
  ```prisma
  enum EventStatus {
    PUBLISHED
    ARCHIVED
  }
  // on Event:
  status EventStatus @default(PUBLISHED)
  tickets Ticket[]
  ```
- [ ] Add:
  ```prisma
  enum TicketStatus {
    UNUSED
    USED
  }

  model Ticket {
    id        String       @id @default(uuid())
    eventId   String       @map("event_id")
    seatId    String       @unique @map("seat_id")
    userId    String       @map("user_id")
    code      String       // "ticketId.sig"
    status    TicketStatus @default(UNUSED)
    createdAt DateTime     @default(now()) @map("created_at")

    event Event @relation(fields: [eventId], references: [id], onDelete: Restrict)
    seat  Seat  @relation(fields: [seatId], references: [id], onDelete: Restrict)
    user  User  @relation(fields: [userId], references: [id], onDelete: Restrict)

    @@index([userId, createdAt])
    @@index([eventId])
    @@map("tickets")
  }
  ```
- [ ] On `Seat`: `ticket Ticket?`. On `User`: `tickets Ticket[]`.
- [ ] Run `cd api && npx prisma migrate dev --name hold_checkout_archive`, expect migration applied + client generated.
- [ ] Append **ADR-008 — Sessão flat no MVP; Evento+N sessões depois** (tempo; agora `Event` = sessão vendável; futuro: Evento pai, sessões filhas, painel org, gráficos/relatórios).
- [ ] Append **ADR-009 — Checkout: hold + pagamento simulado 25%** (rotas, replace hold, soft archive, QR `ticketId.sig`, só `Ticket`).
- [ ] Update `docs/ROADMAP.md`: marcar #3 e #4 como em progresso / mesmo PR; nota “entregues juntos em `feat/seat-hold`”.

---

### Task 2: QR HMAC + helpers de domínio no repo

**Files:**
- Create: `api/src/tickets/qr.ts`
- Modify: `api/src/events/repo.ts`
- Test: `api/tests/qr.test.ts` (ou bloco em `tickets.test.ts`)

- [ ] `qr.ts`:
  ```ts
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
  ```
- [ ] In `repo.ts` add:
  - `HOLD_TTL_MS` from `SEAT_HOLD_TTL_MINUTES` (default 10)
  - `MAX_HOLD_SEATS = 8`
  - `releaseExpiredSeats(tx?)` — `UPDATE` seats `HELD` where `held_until < now()` → `AVAILABLE`, clear hold fields
  - `releaseUserHolds(userId, tx)` — clear all `HELD` by user
  - `holdSeats({ eventId, userId, seatIds })` — validate 1..8, event `PUBLISHED`, lazy expire, release user holds, lock each seat `AVAILABLE` → `HELD` in one transaction; if count mismatch → rollback + throw conflict
  - `releaseHold({ eventId, userId })` — free that user’s HELD on event
  - `getPublishedEvent(id)` — null if missing/ARCHIVED (after lazy expire)
  - Keep `listEvents` filtering `status: PUBLISHED` only
- [ ] Run `cd api && npm test -- tests/qr.test.ts` (ou o arquivo criado), expect pass.

---

### Task 3: API hold + release

**Files:**
- Modify: `api/src/events/routes.ts`
- Modify: `api/src/events/repo.ts` (se faltar)
- Modify: `api/tests/events.test.ts` (ou create `api/tests/hold.test.ts`)

- [ ] `POST /events/:id/hold` — `preHandler: requireRole(Role.CUSTOMER)`  
  Body `{ seatIds: string[] }`.  
  400 se length fora 1..8; 404 se evento arquivado/inexistente; 409 se não lockar todos; 200 `{ seats, heldUntil }` (ISO).
- [ ] `DELETE /events/:id/hold` — `requireRole(CUSTOMER)` — libera hold do user nesse evento; 204.
- [ ] `GET /events/:id` — chamar `releaseExpiredSeats` antes; se `ARCHIVED` → 404; resposta de assentos **não** inclui `heldById`; se Bearer customer e há hold ativo dele, incluir `myHold: { seatIds, heldUntil }` (para restaurar modal).
- [ ] Tests:
  - dois customers, mesmo `seatId` → um 200, outro 409
  - hold replace: segundo `POST` com outros seats libera os primeiros
  - TTL: seed `held_until` no passado + GET → `AVAILABLE`
  - org/door/anon → 401/403 no POST hold
- [ ] Run `cd api && npm test`, expect green.

---

### Task 4: API checkout + list tickets

**Files:**
- Create: `api/src/tickets/repo.ts`
- Create: `api/src/tickets/routes.ts`
- Modify: `api/src/events/routes.ts` (checkout no domínio events) **ou** tickets routes com path `/events/:id/checkout`
- Modify: `api/src/app.ts` — `app.register(ticketRoutes)` se separado
- Modify: `web/vite.config.ts` — proxy `/tickets` → `http://localhost:3000`
- Test: `api/tests/checkout.test.ts`

- [ ] Prefer checkout in `events/routes.ts` + tickets list in `tickets/routes.ts`:
  - `POST /events/:id/checkout` — `requireRole(CUSTOMER)`  
    Lazy expire → load user’s HELD seats for event (must be non-empty, `held_until > now()`).  
    `if (Math.random() < 0.25)` → `402` `{ message: 'Pagamento recusado (simulação ~25% para a demo — não é bug). Tente de novo.' }` sem mudar seats.  
    Else transaction: for each seat `HELD`+user → `SOLD` clear hold; create Ticket with temp id… **Prisma:** create ticket with `code: 'pending'`, then `update` code to `signTicketId(ticket.id)`, or create with uuid from `crypto.randomUUID()` pre-assigned.  
    Response `201 { tickets: [...] }`.
  - `GET /tickets` — `requireRole(CUSTOMER)` → tickets do user com `event { id, title, posterPath, startsAt }` e `seat { row, number }`, order by createdAt desc.
- [ ] Tests: checkout sem hold → 400; recusa mockando `Math.random` → 402 + seats still HELD; ok → SOLD + N tickets + codes verify; GET /tickets agrupável por eventId.
- [ ] Run `cd api && npm test`, expect green.

---

### Task 5: API arquivar sessão

**Files:**
- Modify: `api/src/events/repo.ts`, `routes.ts`
- Modify: `api/tests/events.test.ts`

- [ ] `POST /events/:id/archive` — `requireRole(ORGANIZER)`; só se `organizerId === auth.sub`; transaction: status `ARCHIVED`, all `HELD` → `AVAILABLE` clear hold; 200 event; 403 se outro org; 404 se já archived/missing.
- [ ] `listEvents` / `getEvent` públicos ignoram `ARCHIVED`.
- [ ] Test: após archive, GET público 404; hold 404; tickets já criados ainda no GET /tickets.
- [ ] Run `cd api && npm test`, expect green.

---

### Task 6: Web API client + login `next` + seat selection

**Files:**
- Modify: `web/src/events/api.ts`
- Modify: `web/src/LoginPage.tsx`
- Modify: `web/src/events/EventPage.tsx`
- Modify: `web/src/events/EventPage.test.tsx`
- Create: `web/src/events/CheckoutModal.tsx` (casco nesta task ou task 7)
- Modify: `web/vite.config.ts` — proxy `/tickets`

- [ ] Extend `Seat` type; add `myHold?: { seatIds: string[]; heldUntil: string }` on `EventDetail`.
- [ ] Client fns: `holdSeats(eventId, seatIds, token)`, `releaseHold(eventId, token)`, `checkout(eventId, token)`, `archiveEvent(eventId, token)`, `listMyTickets(token)`.
- [ ] Login: ler `?next=` (path interno safe, ex. `/events/uuid`); após login `navigate(next ?? '/')`. Persistir seleção em `sessionStorage` key `elite.seatSelection.${eventId}` ao redirecionar visitante no Pagar.
- [ ] `EventPage`: mapa clicável — toggle seleção local só em `AVAILABLE` (e não >8); highlight selecionados; HELD/SOLD não clicáveis; botão “Pagar” habilitado com 1..8.
  - Visitante → save selection + `navigate(/login?next=/events/:id)`
  - CUSTOMER → `POST hold` → abrir modal
  - ORGANIZER/DOOR → mensagem “só cliente compra” (sem hold)
  - Se `myHold` no load → reabrir modal (restore F5)
- [ ] Tests: seleção + visitante redireciona login; customer mock hold abre UI de modal.
- [ ] Run `cd web && npm test`, expect green.

---

### Task 7: Checkout modal + release lifecycle

**Files:**
- Create: `web/src/events/CheckoutModal.tsx`
- Modify: `web/src/events/EventPage.tsx`
- Test: `web/src/events/CheckoutModal.test.tsx` / EventPage tests

- [ ] Modal: lista assentos + preço total; countdown de `heldUntil`; botão único “Pagar”; Cancelar/fechar → `DELETE hold` + fecha; timer 0 → `DELETE hold` + fecha.
- [ ] “Pagar” → `POST checkout`; 402 → mostrar message do server (demo); hold permanece; 201 → `navigate('/tickets')` (fecha modal sem DELETE).
- [ ] Navegação SPA para fora de `/events/:id` com modal aberto → `DELETE hold` (cleanup em unmount **só** se `abandoning === true`, não no restore path).
- [ ] Não liberar no remount Strict Mode: flag / ref “intentional close”.
- [ ] Run `cd web && npm test`, expect green.

---

### Task 8: `/tickets` + QR + org Encerrar

**Files:**
- Create: `web/src/tickets/TicketsPage.tsx`
- Create: `web/src/tickets/TicketsPage.test.tsx`
- Create: `web/src/tickets/api.ts` (ou reusar `events/api.ts`)
- Modify: `web/src/App.tsx` — trocar Placeholder por `TicketsPage`
- Modify: `web/src/events/EventPage.tsx` — botão Encerrar se `session.user.role === ORGANIZER` && dono (`organizerId`); confirma → `POST archive` → navigate `/events`
- Modify: `web/package.json` — add dep `qrcode` (+ `@types/qrcode` se precisar)

- [ ] `npm install qrcode` in `web/`; render QR via canvas/img from `ticket.code`.
- [ ] `TicketsPage`: `GET /tickets`, group by `eventId`, heading = title + when; each row seat + QR + status.
- [ ] Guard: não-CUSTOMER vê empty/mensagem; CUSTOMER sem tickets → empty state.
- [ ] Run `cd web && npm test && npm run typecheck`, expect green.
- [ ] Run `cd api && npm test && npm run typecheck`, expect green.

---

### Task 9: Verificação manual + docs finais

**Files:**
- Modify: `docs/ROADMAP.md` (✅ #3 #4 quando Done)
- Modify: `README.md` só se faltar menção a hold/checkout/QR_HMAC (mínimo)

- [ ] Browser: dois browsers/clientes → mesmo assento → um ganha 409 no outro.
- [ ] Fluxo: selecionar → Pagar → modal → falha (repetir) → ok → `/tickets` com QR.
- [ ] Fechar modal / timer → assento volta AVAILABLE.
- [ ] F5 no modal → modal volta.
- [ ] Org Encerrar → some do cartaz.
- [ ] Não abrir PR até checklist acima ok.

---

## Requirement → task map

| Acordo grill | Task |
|--------------|------|
| Só CUSTOMER hold | 3, 6 |
| Lote atômico máx 8 + replace | 2, 3 |
| Lock no Pagar → modal | 6, 7 |
| TTL 10 + timer + DELETE | 2, 3, 7 |
| Lazy GET/hold/checkout | 2, 3, 4 |
| F5 restaura; saída libera | 3 (`myHold`), 7 |
| Checkout 25% + msg demo | 4, 7 |
| Sucesso → `/tickets` por evento | 4, 8 |
| 1 Ticket + QR `ticketId.sig` | 1, 2, 4, 8 |
| Seleção anônima + login next | 6 |
| Soft archive + libera HELD + 404 | 1, 5, 8 |
| ADR futuro Evento/N sessões | 1 |

## Handoff

Executar: **inline** (este chat, task a task) ou **parallel** (subagentes por task — API tasks 2–5 em série por dependência de schema; web 6–8 depois da API).

Só começar código após verbo explícito (*implementa* / *pode codear* / *aplica o plano*).
