# SE-LID-002 — Task Contract (HANDOFF Verboo -> Claude)

Projeto | Tarefa | Agent
saas-salesengine-v1.0 | SE-LID-002 | claude

Project: saas-salesengine-v1.0
Agent: claude (harness final)
Branch: fix/desconhecido-outbound-leads
Worktree: /srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-LID-002
Base: HEAD 3eab92e + commit 2c1bd38 (proposta do verboo, NAO final)
Risk: ALTO — mexe na arquitetura de mensagens/identidade, com produto EM PRODUCAO

## Por que passou para o Claude (decisao do Mateus, 2026-09-18)

"Essa tarefa passa pro Claude, porque é uma tarefa que envolve mexer na arquitetura das mensagens
e o produto tá em produção. Pede pra ele analisar esse fix escrito pelo Verboo, analisar o
diagnóstico feito pelo Verboo, e aí desenhar realmente qual é a melhor solução e executar."

## O CASO (descricao do Mateus, dono do produto)

O cliente **Casa Flow** recebe uma automacao: quando entra um novo lead, ele recebe uma **mensagem
no WhatsApp** avisando do novo lead. Essa mensagem esta chegando com o nome **"Desconhecido"**.

Analise do Mateus: esses leads "Desconhecido" vieram de mensagens que **o proprio cliente iniciou**
(talvez pelo WhatsApp dele). A mensagem sai do WhatsApp dele, entra no sistema, e o lead fica como
desconhecido.

**Expectativa do Mateus (requisito):**
1. O lead **deveria vir com a etiqueta completa** — com o **nome e o telefone**.
2. E o **telefone deveria passar no teste de duplicidade** contra a base de contatos (verificar se
   ja existe outro contato/lead com o mesmo telefone, para nao duplicar).

## Sua tarefa (Claude)

1. **Ler e criticar** o diagnostico (`verboo/diagnostico.md`) e o fix (`verboo/fix.md`) do Verboo —
   ambos ja no worktree, commit `2c1bd38`. O Verboo concluiu que a causa e o **rotulo**
   (`"Desconhecido"`) e que a criacao do lead esta correta; propos `leadNameFromPhone()` + gate de
   `pushName` por `senderType`.
2. **Verificar a conclusao do Verboo.** Concorda? Onde ele errou, simplificou ou deixou hipotese nao
   provada? Ele mesmo marcou varias hipoteses (payload outbound sem `contactName` deduzido do
   sintoma; `pushName` em `fromMe:true`; qual canal o Casa Flow usa).
3. **Desenhar a melhor solucao** para o caso real — considerando os DOIS requisitos do Mateus
   (etiqueta completa nome+telefone; dedup do telefone contra a base) e o fato de estar em producao.
4. **Executar** a solucao desenhada no worktree.

## Requisitos de aceite

- [ ] Mensagem outbound NAO produz lead com rotulo "Desconhecido".
- [ ] Lead criado a partir de outbound tem **nome E telefone** utilizaveis (etiqueta completa).
- [ ] **Dedup por telefone** verificada contra a base (nao criar duplicata quando o telefone ja existe).
- [ ] Nada quebra o fluxo inbound existente (nao regride SE-LID-001 nem o caminho normal).
- [ ] Testes cobrindo o caso outbound + dedup. Baseline registrado sem mascarar.
- [ ] Plano de rollback explicito (produto em producao).
- [ ] `git status` limpo alem dos arquivos do fix + docs.
- [ ] PT-BR nos artefatos; zero credenciais reais.

## Entregaveis

1. `docs/dev/projects/saas-salesengine-v1.0/SE-LID-002/claude/revisao-do-fix-verboo.md`
   — sua analise critica do diagnostico e do fix do Verboo (o que aceita, o que rejeita, por que).
2. `docs/dev/projects/saas-salesengine-v1.0/SE-LID-002/claude/solucao.md`
   — o desenho da melhor solucao + o que foi implementado + validacao + rollback.
3. Codigo do fix no worktree (substituindo ou refinando a proposta do Verboo).
4. `README.md` atualizado com o header e os artefatos dos dois agentes.

## Constraints

- NAO citar credenciais reais (referir como "env vars"/"secrets").
- NAO tocar em `main`/`master` direto, migrations destrutivas, assets compartilhados, pastas de clientes.
- NAO fazer commit/push/PR — isso e do orquestrador.
- Produto EM PRODUCAO: preferir mudanca minima e reversivel; nada destrutivo.
- PT-BR obrigatorio. Verificar: `grep -lE 'Archivo|Fuente|decisión|teléfono|Migración'` deve voltar vazio.
- Testes .tsx exigem `NODE_ENV=test` neste repo (senao falha com "jsxDEV is not a function").

## Nota sobre o commit do Verboo

O commit `2c1bd38` e uma **PROPOSTA NAO FINAL**, preservada para revisao. Voce pode reescrever,
refinar ou substituir. Ele NAO foi enviado para PR.
