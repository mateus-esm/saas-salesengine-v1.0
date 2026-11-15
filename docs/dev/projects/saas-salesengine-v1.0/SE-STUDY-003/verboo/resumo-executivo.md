# SE-STUDY-003 — Resumo executivo

| Projeto | saas-salesengine-v1.0 | Tarefa | SE-STUDY-003 | Agent | verboo | Data | 2026-09-14 |

## Veredito: viável com ressalvas

Dá para usar a mesma infraestrutura Agno do `python-agent` para o agente de atendimento,
rebaixando o GPT Maker a canal. A base (modelos, sessão, RAG, créditos, telemetria, fila com
porta, aprovações, chat interno com streaming) já existe e o contrato inbound já desenha a
fronteira transporte ↔ cognição. Falta construir a camada de atendimento (adapter de canal,
identidade, handoff, entrega, idempotência fim a fim, limites). Nenhuma peça exige trocar a
base ou criar um segundo serviço.

## Prós (5)

- Reuso direto: sessão Agno, fábrica de modelos por variável de ambiente, RAG por tenant,
  créditos idempotentes e SSE já operam (`agno_store.py`, `llm.py`, `knowledge.py`,
  `credits.py`, `events.py`, `copilot/chat.py`).
- Uma razão e uma telemetria em vez de dois mundos (hoje o provider TypeScript tem
  `TODO`/mock com `creditsAvailable: 1464`).
- Controle de prompt, RAG, roteador de custo e guardas dentro de casa; troca de provedor sem
  mudar código.
- Fila com porta (`ingest_enabled`, `is_crm_agent_enabled`) e HITL (`observe/suggest/
  autonomous`, `approvals`) prontos para piloto seguro.
- Canal próprio (`solo-wpp-webhook`) já existe como substituto natural do transporte.

## Contras (5)

- Esforço P0 antes do piloto: endpoint de conversa, respondedor, identidade, handoff, entrega
  e idempotência com restrição única.
- Risco de regressão de qualidade frente ao agente externo já ajustado em produção.
- Latência e custo de tokens viram responsabilidade própria (exigem fila, ACK rápido, tetos).
- Superfície de LGPD e multi-tenant sob responsabilidade própria.
- Convivência prolongada com dois cérebros até o desligamento total.

## Trade-offs que importam

Custo opaco externo contra custo visível por tenant; latência herdada contra latência
projetada; velocidade de manter contra controle de migrar; qualidade herdada contra qualidade
construída com avaliação.

## 3 decisões que Mateus precisa tomar

1. O piloto começa em qual equipe e canal, com qual teto de crédito por conversa e dia?
2. O modo inicial do atendimento é `observe` (sombra), `suggest` (humano aprova) ou
   `autonomous` restrito a baixo risco — e quem aprova?
3. O envio continua na borda (`send-chat-message`/`sendViaSolo`) com o python-agent só
   redigindo, ou o python-agent passa a entregar direto no provedor?

## Próximo passo recomendado

Fase 1 sombra: espelhar o inbound para o python-agent em `observe` (sem responder), medir
qualidade, latência e custo por 1–2 semanas, e só então ligar o piloto assistido em uma
equipe e um canal. Detalhes e critérios de aceite no `estudo-completo.md` (§10).
