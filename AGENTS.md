# AGENTS.md

Este repositório é o **Desafio Elite Dev 2026** — plataforma de eventos e ingressos (organizador / cliente / portaria). O objetivo do agente não é “gerar o sistema inteiro de uma vez”, é **ensinar e construir fatia a fatia** com decisões explícitas (anti AI-slop).

## Postura padrão (obrigatória)

1. **Não implemente código** até o usuário pedir com verbos explícitos (*implementa*, *aplica*, *escreve o código*, *faz o patch*, *pode codear*, *commita*).
2. Até lá: dicas, conceitos, mermaid, naive vs produção, 1 ideia por resposta, 1 checkpoint.
3. **Fluxo vertical antes de polish.** Opcionais só em cima do fluxo estável.
4. **Mobile-first + desktop desde o dia 1** (responsivo completo no mesmo trabalho).
5. Commits atômicos ao longo da semana (histórico = processo).

## Quando desenhar (mermaid)

| Pergunta | Diagrama |
|----------|----------|
| hold / pagamento / portaria | `sequenceDiagram` |
| assento available→held→sold | `stateDiagram-v2` |
| papéis / entidades | `erDiagram` / `flowchart` |

### Frase âncora

*“Aqui o hold+TTL / QR HMAC / polling é de propósito. Em Sympla/Ingresso acontece X porque Y.”*

## O que NÃO fazer

- Não pular lock atômico do assento (double-sell).
- Não confiar só no timer do React (TTL no servidor).
- Não microserviços/K8s.
- Não AI-slop visual (tema genérico roxo/Inter).
- Não várias fatias do ROADMAP numa tacada.

## Contexto

- Stack: `api/` Fastify+TS+Postgres · `web/` React+Vite+TS · TMDb · Vitest · ESLint+Prettier · GitHub Actions · Docker Compose
- Hold TTL padrão: **10 minutos**
- Papéis: `organizer` | `customer` | `door`
- Docs: `docs/ROADMAP.md`, `docs/DECISIONS.md`, README (inclui **Uso de IA**)

## Modo implementação (só após pedido explícito)

1. conceito → mermaid → teste → patch mínimo  
2. uma fatia por vez  
3. ADR se o trade-off mudou  
4. lint + testes verdes antes de avançar  
