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

## Dados de teste (seed — próximas fatias)

| Papel | Uso |
|-------|-----|
| 1 organizador | cria/gerencia eventos |
| 2 clientes | reserva + pagamento |
| 1 portaria | valida QR |
| ≥1 evento | mapa com assentos livres |

## Uso de IA

(Documentar ao longo do desafio: ferramentas, o que a IA fez, o que você decidiu sem IA.)

## Docs

- [ROADMAP.md](docs/ROADMAP.md)
- [DECISIONS.md](docs/DECISIONS.md)
- [AGENTS.md](AGENTS.md)
