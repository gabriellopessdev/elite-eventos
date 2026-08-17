# Roadmap — Elite Eventos

Uma linha = uma entrega. **Fluxo vertical antes dos opcionais.**

| # | Fatia | Status | Done quando… |
|---|-------|--------|--------------|
| 0 | Bootstrap api+web · lint · prettier · testes health · CI · Compose | ✅ | pipeline verde local |
| 1 | Auth 3 papéis + seed users | ✅ | login organizer/customer/door |
| 2 | TMDb + criar/listar eventos (org) | ✅ | evento publicado com grade |
| 3 | Mapa assentos + hold TTL 10 min + lock atômico | ✅ | double-sell impossível — junto com #4 em `feat/seat-hold` |
| 4 | Pagamento simulado ok/recusa → ingresso + QR HMAC | ✅ | meus ingressos — junto com #3 em `feat/seat-hold` |
| 5 | Portaria: câmera + digitação · válido/inválido/usado/evento errado | ⬜ | fluxo ponta a ponta — em `feat/door` |
| 6 | Link compartilhável do ingresso | ⬜ | abre ingresso read-only |
| 7 | Busca/filtro · painel org · cancelamento+estoque | ⬜ | opcionais produto |
| 8 | Tempo real no mapa (polling→WS) | ⬜ | outros veem hold |
| 9 | Testes de domínio + README Uso de IA + deploy | ⬜ | entrega |

```mermaid
flowchart LR
  A[Auth] --> E[Evento+TMDb]
  E --> H[Hold+Timer]
  H --> P[Pagamento]
  P --> Q[QR]
  Q --> D[Portaria]
```
