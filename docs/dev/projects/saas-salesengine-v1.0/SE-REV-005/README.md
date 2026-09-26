# SE-REV-005 — Outreach operável pela tela + guarda de abertura

| Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências |
|---|---|---|---|---|---|---|
| saas-salesengine-v1.0 | SE-REV-005 — mensagem de abertura editável, apagar sequência, portas corretas, variáveis visíveis, não abrir conversa com quem já está em atendimento | Discord #solo-dev 2026-09-26, reporte do dono (5 pontos) | claude (execução) | Código pronto e testado. UI provada no build real contra o banco de produção. Guarda provada com leads reais. **Aguarda deploy** | [`contexto/spec.md`](contexto/spec.md), [`claude/implementacao.md`](claude/implementacao.md), [`claude/evidencias/`](claude/evidencias/) | Deploy de `outreach`, `start-conversation`, `outreach-worker` e do front. O dono decide sobre as 2 portas órfãs da Casa Flow, a sequência na porta "Manual" e a janela de 24 h. "Cliente responde → agente" ainda sem prova real. Ver §8 da implementação |

## Causas raiz

- **Mensagem inicial invisível:** a configuração só existia no banco e no
  `start-conversation/update-settings`, e nenhuma tela lia esses campos. O
  `update-profile` citado no spec **não** grava `first_message`.
- **Apagar sequência:** a ação não existia.
- **Portas:** o palpite do dono ("puxando do geral") estava errado, porque a consulta
  já filtrava por equipe e por ativa. O problema real: um webhook apagado deixa a
  porta viva (FK `on delete set null`), e ela nunca mais recebe lead. A Casa Flow
  tem **duas** dessas: `dcf93cfc` "Meta ADS - Cadastro" e `10a34b8d` "Landing Page".
- **Já em atendimento:** a abertura não olhava as mensagens do lead. Dos 7 envios
  automáticos da Casa Flow, **4** foram para leads que já estavam conversando com o
  agente. Um deles é o próprio evento `9c2d4fb0` que o spec usou como prova.
  `conversations.opened_at` **não** detecta esse caso, porque estava nulo nele. O
  sinal usado passou a ser uma mensagem do cliente nas últimas 24 h.
- **Variáveis:** a tela não mostrava a lista, e uma variável desconhecida virava
  texto vazio sem aviso.

## Arquivos

- `supabase/functions/_shared/outreach/{template,entries,in-service}.ts` (novos, com testes)
- `supabase/functions/start-conversation/index.ts` (guarda e validação do `update-settings`)
- `supabase/functions/outreach/index.ts` (`delete-sequence`, portas filtradas, validação)
- `supabase/functions/_shared/outreach/worker.ts`, `supabase/functions/outreach-worker/index.ts`
  (guarda no passo 0 da cadência)
- `supabase/functions/_shared/outreach/{api-validation,gptmaker}.ts`
- `src/pages/OutreachSettings.tsx`, `src/components/outreach/MessageTemplateField.tsx`,
  `src/lib/message-variables.ts` (com testes)

Nenhuma migration.
