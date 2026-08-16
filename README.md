# Elite Eventos

Plataforma de **eventos e ingressos** — Desafio Elite Dev 2026.

Organizador publica eventos a partir do **TMDb**; cliente escolhe **assento** (hold + timer 10 min), paga de forma simulada, recebe ingresso com **QR**; portaria valida na entrada.

> Escopo pequeno de propósito. O que conta: decisões, fluxo completo, mão no resultado (não AI slop).

## Stack

| Camada | Escolha |
|--------|---------|
| Front | React + Vite + TS · **responsivo mobile + desktop** |
| Back | Node + Fastify + TS |
| DB | Postgres |
| Catálogo | TMDb |
| Qualidade | ESLint + Prettier · Vitest · GitHub Actions · Docker Compose |

## Rodar local

```bash
# requisitos: Node 20+, Docker (Postgres nas próximas fatias)
cp api/.env.example api/.env

docker compose up -d
cd api && npm install && npm run dev
cd web && npm install && npm run dev
```

- API: http://localhost:3000/health  
- Web: http://localhost:5173  
- GraphiQL: N/A (REST)

### Scripts de qualidade

```bash
cd api && npm run lint && npm run format:check && npm test
cd web && npm run lint && npm run format:check && npm test
```

## Dados de teste (seed)

| Email | Senha | Papel |
|-------|-------|-------|
| `org@elite.local` | `org12345` | ORGANIZER |
| `cliente1@elite.local` | `cli12345` | CUSTOMER |
| `cliente2@elite.local` | `cli12345` | CUSTOMER |
| `portaria@elite.local` | `door12345` | DOOR |

```bash
cd api
cp .env.example .env   # se ainda não tiver
docker compose up -d   # na raiz do repo
npm run db:migrate
npm run db:seed
```

Login: `POST /auth/login` → `{ accessToken, refreshToken, user }`.  
Refresh: `POST /auth/refresh` `{ "refreshToken" }` → novo par (rotação).  
Logout: `POST /auth/logout` `{ "refreshToken" }` → 204.  
Perfil: `GET /auth/me` com `Authorization: Bearer …`.


## Uso de IA

(Documentar ao longo do desafio: ferramentas, o que a IA fez, o que você decidiu sem IA.)

## Docs

- [ROADMAP.md](docs/ROADMAP.md)
- [DECISIONS.md](docs/DECISIONS.md)
- [AGENTS.md](AGENTS.md)
