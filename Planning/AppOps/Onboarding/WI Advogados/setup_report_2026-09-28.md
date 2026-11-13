# Onboarding 28/09/2026 — Rema Digital e WI Advogados

Discovery → ambiente, com as mesmas ferramentas do app (linhas iguais às da tela "Nova pipeline", GPT Maker pelo agent-creator). Nenhum código alterado.

## Como reproduzir para o próximo cliente
1. Exportar o briefing do discovery (`<cliente>.md`).
2. Copiar `<cliente>_setup.sql` de um destes e trocar equipe, pipelines, campos, dicas do Copilot e gatilhos.
3. `python supabase/scripts/run_sql.py <arquivo> --rehearse` → `--commit`.
4. Agent-creator: `snapshot-agent` → dataset em `clients/<cliente>/<agente>/datasets/` → `validate` → `upload-dataset --agent <id> --live` (com `MSYS_NO_PATHCONV=1` no Git Bash).

## Aplicado
| | Rema Digital | WI Advogados |
|---|---|---|
| Pipelines | `Rema | Performance E-commerce Moda` (9 etapas, 10 campos) | `WI | Passivo Bancário Empresarial` (9 etapas, 7 campos) e `WI | Isenção IRPF por Doença Grave` (9 etapas, 8 campos) |
| Motivos de perda | os 6 do discovery | Fora do perfil, Sem requisitos legais, Sumiu, Adiou, Honorários, Outro escritório |
| Origens | Meta Ads, WhatsApp (anúncio Meta) | Instagram, Indicação, WhatsApp |
| Legado | pipeline antiga arquivada; 2 negócios abertos movidos | `IPVA - Isenção TEA` arquivada (1 negócio Ganho fica lá) |
| Copilot | 1 agente `suggest` + dicas da linha + 3 gatilhos | 2 agentes `suggest` + dicas + 3 gatilhos cada |
| Gatilhos | sem resposta 24h → tarefa + tag; MQL → tarefa Renan; reunião → tarefa preparo | sem resposta 24h → tarefa; qualificado → tarefa Dr. Walter; leitura marcada → tarefa preparo |
| Agente | RemAI → **Rafael**, 15 treinos antigos removidos, 12 blocos novos | **Regina v2**: IRPF mantido, + Passivo Bancário, honorários removidos; 19 blocos; ligada à equipe |
| Atendimento | não alterado | desligado (`is_crm_agent_enabled=false`) |

## Suposições a confirmar na reunião
- Rema: critério de qualificação = marca própria de moda + site ≥ R$ 10 mil/mês + decisor (discovery: "a confirmar").
- WI: objeções escritas a partir das regras de compliance; pisos de renda/retroativo do IRPF (briefing de 04/07) mantidos.

## Falta (go-live)
- Conectar WhatsApp (Rema: número atual; WI: a confirmar) e Google Calendar (Renan / Dr. Walter).
- Virar Copilot para `autonomous` depois de ver as primeiras sugestões.
- Rodar `rema_digital_trainings_cache_cleanup.sql` (cache do Studio AI com os 15 treinos antigos).
- Lacuna de produto: não há notificação push de lead (qualificado, reunião, perdido, nova conversa) — coberto por tarefas do Copilot.
