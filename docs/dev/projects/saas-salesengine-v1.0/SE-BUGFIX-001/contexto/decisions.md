# SE-BUGFIX-001 — Decisions

- 2026-09-27: Task roteada para o harness **Verboo** por decisão explícita do dono ("Passe para o verboo dev").
- 2026-09-27: Bug 1 é prioridade (vazamento entre tenants). A leitura literal do dono é "o próprio time e o Master admin" — o papel `owner` também atravessa hoje; manter como está salvo instrução do dono, e registrar.
- 2026-09-27: Bug 3 — só criar tipo de notificação novo se ele realmente não existir; reportar o comportamento real de tolerância pós-crédito em vez de inventar.
