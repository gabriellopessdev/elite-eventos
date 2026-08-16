# Decisions (ADR leve)

## ADR-001 — Node/TS + Fastify + Vite

**Status:** accepted  
**Contexto:** 7 dias; músculo em Node/TS/React; vaga também pede Python, mas o PDF aceita Node.  
**Decisão:** Fastify + React/Vite + Postgres. 
**Alternativas:** FastAPI; Nest (mais cerimônia).

## ADR-002 — Hold de assento com TTL 10 minutos

**Status:** accepted  
**Contexto:** evitar double-sell e dar tempo de checkout.  
**Decisão:** `available → held (held_by, held_until) → sold`; `UPDATE … WHERE status='available'`; TTL **10 min**; front mostra countdown a partir de `held_until`. Timer UI não é fonte da verdade.  
**Consequências:** precisa liberar expirados (lazy no acesso + job leve).  
**Produção:** Redis lock, WS, filas — documentar no README.

```mermaid
stateDiagram-v2
  [*] --> available
  available --> held: hold atômico
  held --> sold: pagamento ok
  held --> available: TTL / cancel
```

## ADR-003 — QR não forjável via HMAC

**Status:** accepted (desenho)  
**Decisão:** código do ingresso = payload assinado (HMAC) verificável só com segredo do servidor.  
**Alternativas:** JWT curto; só UUID opaco no DB (mais frágil se vazar padrão).

## ADR-004 — TMDb como catálogo externo

**Status:** accepted  
**Decisão:** TMDb para filmes/shows em cartaz; Ticketmaster fica fora do MVP.  
**Consequências:** precisa `TMDB_API_KEY` no `.env`.

## ADR-005 — UI responsiva mobile + desktop desde o dia 1

**Status:** accepted  
**Decisão:** mobile-first com breakpoints desktop no mesmo trabalho; anti AI-slop (tipografia/cores próprias).
