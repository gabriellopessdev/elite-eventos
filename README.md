# Elite Eventos

Plataforma de **eventos e ingressos** — Desafio Elite Dev 2026.

Organizador publica eventos a partir do **TMDb**; cliente escolhe **assento** (hold + timer 10 min), paga de forma simulada, recebe ingresso com **QR** e **PIN de 6 dígitos**; portaria valida na entrada.

> Escopo pequeno de propósito. O que conta: decisões, fluxo completo, mão no resultado (não AI slop).

## Stack


| Camada    | Escolha                                                      |
| --------- | ------------------------------------------------------------ |
| Front     | React + Vite + TS · Tailwind v4 · **mobile + desktop**       |
| Back      | Node + Fastify + TS                                          |
| DB        | Postgres                                                     |
| Catálogo  | TMDb                                                         |
| Qualidade | ESLint + Prettier · Vitest · GitHub Actions · Docker Compose |




## Rodar local

```bash
# requisitos: Node 22+, Docker (Postgres)
cp api/.env.example api/.env

docker compose up -d
cd api && npm install && npm run dev
cd web && npm install && npm run dev
```

- API: [http://localhost:3000/health](http://localhost:3000/health)  
- Web: [http://localhost:5173/login](http://localhost:5173/login)  
- O Vite encaminha `/auth`, `/movies`, `/events` e `/tickets` para a API (`localhost:3000`)
- Em `api/.env`, além do JWT: `QR_HMAC_SECRET` (assinatura do QR) e opcional `SEAT_HOLD_TTL_MINUTES=10`



### TMDb (obrigatório para publicar sessão)

A busca de filme passa pela API (`GET /movies/search`). A chave **não** vai no browser.

1. Conta grátis em [themoviedb.org](https://www.themoviedb.org/signup)
2. [Settings → API](https://www.themoviedb.org/settings/api) → pedir chave (**API Key**, o token v3 — não o Bearer v4)
3. Em `api/.env`: `TMDB_API_KEY=a_sua_chave` (sem aspas, sem espaço)

Sem isso, o organizador recebe **503** ao buscar. Não commitar `api/.env`.

### Scripts de qualidade

```bash
cd api && npm run lint && npm run format:check && npm test
cd web && npm run lint && npm run format:check && npm test
```



## Dados de teste (seed)


| Email                  | Senha       | Papel     |
| ---------------------- | ----------- | --------- |
| `org@elite.local`      | `org12345`  | ORGANIZER |
| `cliente1@elite.local` | `cli12345`  | CUSTOMER  |
| `cliente2@elite.local` | `cli12345`  | CUSTOMER  |
| `portaria@elite.local` | `door12345` | DOOR      |


```bash
cd api
cp .env.example .env   # se ainda não tiver
docker compose up -d   # na raiz do repo
npm run db:migrate
npm run db:seed
```

Tela: [http://localhost:5173/login](http://localhost:5173/login) — atalhos **preenchem** o seed; o papel vem da API.  
Portaria (`DOOR`): [http://localhost:5173/door](http://localhost:5173/door) — Validar (câmera no QR ou PIN de 6 dígitos).  
API: `POST /auth/login` → `{ accessToken, refreshToken, user }`.  
Refresh: `POST /auth/refresh` `{ "refreshToken" }` → novo par (rotação).  
Logout: `POST /auth/logout` `{ "refreshToken" }` → 204.  
Perfil: `GET /auth/me` com `Authorization: Bearer …`.

## Uso de IA

(Documentar ao longo do desafio: ferramentas, o que a IA fez, o que você decidiu sem IA.)

## Docs

- [ROADMAP.md](docs/ROADMAP.md)
- [DECISIONS.md](docs/DECISIONS.md)
- [AGENTS.md](AGENTS.md)

