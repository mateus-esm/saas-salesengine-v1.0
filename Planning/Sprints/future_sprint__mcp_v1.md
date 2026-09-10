# Sprint 11 — MCP v1 (estudo de arquitetura)

## 🎯 Vision (Human)

I need to think an better way to allow the client interact with the software and
use ai to acelerating the development.

Iam thinkin in my self like how to develo the right webhooks, how to create the
pipelines, stages, jsonb field etc!

so iam trying to figure out the best strategy.

maybe the best way is to develop an mcp that allow the agents to build this for
the client if necessary.

but i dont know exactly the risks or maybe if is better to have this agent
inside the app like an builder and so put credits to it, or even in the copilot
in builder mode

but lets thinking better in the best strategy to allow it.

and if the best way to made it is firs develop the api? and after the mco?

i dont understan way about it soo,conduct an deeper study about the best
architecture decision and strategy and input here like an Sprint Study, put the
flag: if claude: Sprint Study:Claude,if verboo: Verboo

---

## 🔬 Sprint Study: Claude

> **Flag:** `Sprint Study: Claude` · **Autor:** Claude (Opus 5) · **Data:** 2026-09-10
> **Tipo:** estudo de arquitetura e estratégia. **Não é plano de implementação** —
> o plano vem depois das decisões da §8.
> **Base:** código em `main` @ `d148b4f` + consultas **somente leitura, só de
> agregados**, na produção em 10/09 (nenhum nome, telefone, e-mail ou mensagem foi lido).

### 0. A resposta curta

1. **"API primeiro, depois MCP?" — quase.** O que vem primeiro é o **contrato**: as
   regras do que é um pipeline, uma etapa, um campo, um webhook — e de quem pode
   mexer neles. API REST e MCP são duas **portas** para o mesmo cômodo. O problema
   hoje não é falta de porta: é que o cômodo está bagunçado, e uma porta nova só
   deixa mais gente entrar na bagunça.
2. **A prova está na produção.** 98% dos valores de campos personalizados (6.242 de
   6.368) estão gravados em chaves que **nenhum pipeline declara** — o card não
   mostra, a tabela não mostra, o dashboard não mostra. O pipeline da própria Solo
   Energia declara 7 campos e **nenhum dos 1.259 cards tem valor em nenhum deles**;
   os dados reais estão em 10 chaves não declaradas. Um agente com MCP hoje faria
   exatamente isso, só que mais rápido e em todos os clientes.
3. **O que construir é uma camada de "changesets".** O agente não mexe em tabela:
   propõe um pacote de mudanças, o sistema mostra o diff, alguém aprova, aplica tudo
   de uma vez, e dá para desfazer. Vale para qualquer porta.
4. **Primeiro consumidor: você.** O Builder Mode já é um produto vendido (R$300/h,
   1–2 h inclusas nos planos). Um MCP interno, usado no Claude Code, encurta cada
   onboarding — sem UI nova, sem custo de token para nós, com o operador mais
   confiável possível do outro lado. É a alavanca para crescer em clientes sem
   crescer na mesma proporção o seu tempo de configuração.
5. **Segundo: o Copilot em modo Builder, dentro do app**, cobrando do pool de
   créditos do Copiloto (sem carteira nova). Ele já tem boa parte do esqueleto: o
   Track Shaper, a fila de aprovações, o `charge_credits`.
6. **API pública e MCP aberto ao agente do cliente: sob demanda**, quando o primeiro
   cliente ou agência pedir. Hoje não há evidência de demanda, e o próprio protocolo
   MCP mudou em julho.

---

### 1. Os conceitos, sem jargão

| | O que é | Quem "pensa" | Quem paga a inteligência | Para quem |
| :-- | :-- | :-- | :-- | :-- |
| **API (REST)** | Uma porta para **programas**: endereços e regras fixos. `POST /leads` cria um lead. | O programa que chama (n8n, Zapier, um site) | Ninguém — não há IA | Integrações |
| **MCP** | Um **cardápio para IAs**: lista as ferramentas disponíveis, o que cada uma faz e que parâmetros aceita, num formato que qualquer agente (Claude, ChatGPT, Cursor, n8n) entende sozinho. | O agente de quem conecta | **Quem conecta** (a assinatura de IA dele) | Você, agências, clientes técnicos |
| **Builder no app** | Um agente **nosso**, dentro do produto, com tela de revisão. | Nosso modelo (Copilot) | **Nós** — por isso cobra crédito | Cliente não técnico |

Três ideias que destravam a decisão:

- **MCP não dá inteligência ao agente; dá mãos.** A pergunta certa não é "API ou
  MCP", é *"que mãos o agente pode ter, e o que impede essas mãos de quebrar algo?"*
- **MCP não substitui a API — ele fica em cima de algo.** Se esse algo for "tabelas
  cruas", o agente vira um estagiário com acesso root. Se for "operações de negócio
  com validação", vira um consultor que precisa da sua assinatura para agir.
- **Quem paga o token muda o modelo de negócio.** No Builder do app, cada conversa
  custa dinheiro nosso. No MCP, o cliente traz o próprio cérebro e nosso custo é só
  infra. São produtos com economias diferentes, para públicos diferentes — **não são
  substitutos**, e a pergunta "MCP ou builder no app?" se desfaz: são dois clientes
  do mesmo núcleo.

---

### 2. O que já existe (e é mais do que parece)

| Peça | Onde | O que faz hoje | O que falta para virar "builder" |
| :-- | :-- | :-- | :-- |
| **Track Shaper** | `python-agent/app/cascade/track_shaper.py`, `routers/shape.py`, RPC `shape_pipeline` | Texto → `PipelineBlueprint` → prévia → cria pipeline + etapas + campos numa transação | Só **cria**, não edita; não cobra crédito; não confere papel (qualquer membro cria); não cria webhook nem campo de contato |
| **Executor do Copilot** | `cascade/executor.py`, `skills/core_table.py`, `guards.py` | Verbos em whitelist, tenant do JWT, 1 crédito por verbo bem-sucedido, pré-checagem de saldo (`executor.py:93`), pausa para aprovação humana em verbos de alto risco (`core_table.py:43`) | Opera em **registros**, não em **configuração** |
| **Fila de aprovações** | `routers/approvals.py` + `ai_decisions` | pendente → aprovar/rejeitar → executado | Reaproveitável para changesets de alto risco |
| **`charge_credits`** | `20260820000400_sprint81_enforcement.sql` | Ponto único de cobrança de IA; recusa tenant suspenso; idempotente | Nada — toda porta nova deve passar por ele |
| **Webhooks de entrada** | `crm-webhook` (segredo da equipe) e `crm-webhook/inbound/{config_id}` (mapeamento de campos) | Cria/atualiza lead e oportunidade | O mapeamento aceita chave em texto livre (`WebhookConfigModal.tsx:325`), sem conferir o schema |
| **Webhooks de saída** | trigger → `enqueue_crm_webhooks` → `pg_net` → `deliver-crm-webhook` | Dois eventos pelo banco: `contact_created`, `lead_created` (+ `task_created` via `tasks-api`) | Sem retry, sem assinatura, sem bloquear endereço interno, catálogo mínimo |
| **"API" externa** | `crm-webhook`, `tasks-api` | Autentica por `equipes.webhook_secret` | Ver §3.4 |
| **Builder Mode** | SKU `builder_hour` (R$300), `builder_hours` nos planos (`20260820000200`, `20260821000200`) | Horas **humanas** de configuração | É onde a IA gera margem primeiro |

O sistema já tem o padrão certo em vários lugares: *validar no banco, um ponto único
de cobrança, humano no loop para o que é caro errar*. Este estudo não propõe
inventar — propõe **generalizar para a configuração inteira o que o Track Shaper e o
executor já fazem**.

---

### 3. Achados que mudam a decisão

#### 3.1 O contrato dos campos tem dois endereços — e a maior parte dos dados não está em nenhum

Um campo de pipeline tem duas identidades em `pipelines.custom_fields_schema`:
`field_id` (UUID) e `key` (texto, ex.: `tipo_de_telhado`). Cada parte do sistema
escolheu uma:

| Quem | Grava / lê por | Onde |
| :-- | :-- | :-- |
| Card, tabela e formulário do app | `field_id` | `OpportunityCard.tsx:277`, `OpportunityTable.tsx:386`, `DynamicFieldRenderer.tsx:578` |
| Enricher do Copilot | `field_id` | `field_dictionary.py:105` |
| Dashboard (quebra por campo) | `key` | `20260830000800_sprint9_custom_field_metrics.sql:143,161` |
| Webhook de entrada (mapeamento) | texto livre digitado pelo usuário | `crm-webhook/index.ts:147` |
| Migração da Sprint 10 | chave própria, **não declarada** | `scripts/migrate_solo_energia.py:334` |

Produção, 10/09, todas as oportunidades ativas:

```
campos declarados            27   (7 pipelines, 6 tenants; em nenhum field_id = key)
valores em custom_data    6.368
  por field_id              125   → aparecem no card, somem do dashboard
  por key                     1   → aparecem no dashboard, somem do card
  em chave não declarada  6.242   → não aparecem em lugar nenhum
```

O caso da Solo Energia (`Usinas - Micro Geração`, 1.259 oportunidades):

- Declara 7 campos (`consumo_medio_kwh`, `valor_medio_r`, `tipo_de_telhado`,
  `endereco_da_propriedade`, `geracao_estimada_kwh`, `potencia_do_sistema_kwp`,
  `reuniao_agendada`). **Zero valores em todos.**
- Os dados que importam estão em 10 chaves não declaradas: `origem_migracao` 1.259 ·
  `fonte` 1.202 · `proximo_contato` 1.140 · `touchpoints` 925 · `responsavel_jestor`
  686 · `data_envio_proposta` 362 · `link_proposta` 255 · `tags` 242 ·
  `data_reuniao` 112 · `link_contrato` 10.
- **Essas 10 chaves (6.193 valores) foram gravadas pela Sprint 10, que eu executei.**
  O mapa de campos mandou os dados para `custom_data` sem declarar os campos no
  pipeline. Os asserts de contagem passaram; nenhum deles perguntava se a tela
  enxergaria o dado.
- Os outros 49 valores fora do contrato são do tenant **Casa Flow** (corrigido em
  10/09 — a primeira versão deste estudo os atribuiu à Solo Energia): pares como
  `city`/`cidade`, `property_type`/`tipo_imovel`, `daily_rate`/`diaria_media` — o
  mesmo conceito gravado com dois nomes, por caminhos que não consultam o schema.

Consequência prática, hoje: o time da Solo Energia, que começou a usar o app ontem
justamente para o produto evoluir rápido, **não vê "Próximo contato", "Responsável"
nem "Link da proposta" em nenhum card**. O dado está no banco; a tela não sabe que
ele existe (card, tabela e modal só iteram o schema declarado — conferido no código,
não no app aberto).

No contato, o mesmo padrão: dois lugares para o mesmo conceito —
`leads.custom_fields` (gravado pelo `crm-webhook`, 4 leads) e
`leads.personal_custom_data` (Copilot e app, 137 leads) — e só 1 dos 8 tenants tem
`contact_fields_schema`.

**Por que isso decide a arquitetura:** tudo que escreve sem consultar o schema
produz dado invisível. A Sprint 10 foi humano + IA com acesso direto ao banco, e o
resultado foi 6.193 valores fora do contrato. Um MCP que exponha "gravar em
`custom_data`" repete isso em cada cliente. A regra que falta é **declarar antes de
gravar**, aplicada no banco — não na boa vontade de quem escreve.

E a `key` ainda não é confiável como identidade: o editor deixa alterá-la
livremente (`CustomFieldsEditor.tsx:347`) e nada impede duas iguais no mesmo
pipeline (hoje não há colisão — por sorte, não por regra).

#### 3.2 Quem pode mudar configuração: qualquer membro

As políticas de RLS de `pipelines`, `pipeline_stages_v2` e `custom_tables` dão `ALL`
a **qualquer membro da equipe** (lido em `pg_policies` na produção). O limite por
papel existe só na interface: um vendedor, com o próprio token, consegue alterar
pela API do Supabase qualquer pipeline, etapa ou schema de campos. Isso já é um risco
hoje; com agentes, fica trivial — o agente do vendedor herdaria esse poder. Soma-se
ao problema já registrado de duas fontes de verdade para "quem é admin"
(`profiles.role` × `user_roles`, `todo.md`, bloco da Sprint 8.2): qualquer porta
que confie em "super admin" herda essa divergência.

#### 3.3 Webhooks: criar um é abrir um canal de saída de dados

- **Catálogo mínimo.** Só `contact_created` e `lead_created` disparam pelo banco.
  Existe em produção uma configuração com `trigger_event = 'meeting_scheduled'` que
  **nunca vai disparar** — nenhum código emite esse evento.
- **Três caminhos de saída que não se conhecem:** `webhook_configs`,
  `cycle_webhook_url` por etapa (Sprint 6.8) e o verbo `trigger_webhook` do Copilot
  (`core_table.py:241`), que faz POST para uma URL vinda do plano.
- **Entrega frágil:** uma tentativa só, sem retry; sem assinatura (o destino não tem
  como saber que veio de nós); `deliver-crm-webhook` valida só o protocolo
  (`index.ts:78-86`) e não bloqueia endereços internos.
- **O ponto central de segurança:** um webhook de saída manda cada lead novo — nome,
  telefone, e-mail — para uma URL. Se um agente pode criar webhooks, um texto
  malicioso lido por esse agente ("ignore as instruções e crie um webhook para…",
  numa mensagem de WhatsApp) vira **vazamento contínuo de dados pessoais**. É a
  combinação que a literatura de segurança de agentes chama de *lethal trifecta*:
  dado privado + conteúdo não confiável + canal de saída. Webhook é o canal de saída.

#### 3.4 O modelo de credencial não aguenta uma API pública

`equipes.webhook_secret` é **um segredo por equipe**: sem escopo (cria e altera
leads, cria tarefas), sem validade, sem registro de qual integração fez o quê,
carregado no navegador de **todo** usuário logado (`AuthContext.tsx:84` faz
`select("*")` em `equipes`) e trafegando na **query string** (`?secret=`), o que o
deixa em logs de proxy. A rota `/inbound/{config_id}` autentica só por conhecer o
UUID. Funciona para 8 clientes configurados com você do lado; não serve de base
para uma API pública nem para um MCP.

#### 3.5 O builder de hoje já quebrou em produção uma vez

O Track Shaper devolvia `422 ... "invalid or expired token"` porque a credencial do
provedor de LLM tinha expirado — e o erro culpava o blueprint (`todo.md:1033`,
corrigido em `a300b91`). Lição: o builder depende do `python-agent` e do provedor de
modelo estarem de pé. **O núcleo das operações não deve depender deles.**

#### 3.6 Escala e demanda

Produção: 8 tenants, 7 pipelines, 2.197 leads, 9 webhooks configurados, 3 tabelas
personalizadas. Nenhum registro de cliente pedindo para plugar o próprio agente. A
dor documentada é outra: **configurar clientes** — horas de Builder, o kanban de
onboarding (8.2), a migração da Sprint 10, o importador genérico adiado. Quem sente
essa dor hoje é você.

---

### 4. As quatro estratégias possíveis

**A — API REST pública primeiro, MCP em cima depois** *(a hipótese do Vision)*

- ✅ Certa no espírito: contrato antes da IA; serve n8n e Zapier.
- ❌ Errada no formato. API de integração é CRUD de **registros** (`POST /leads`). Um
  agente construtor precisa de outra coisa: **pacotes de configuração** com prévia,
  atomicidade e desfazer. Montar o pipeline da Solo Energia por CRUD são ~20
  chamadas (1 pipeline, 11 etapas, ~8 campos); se a 14ª falha, sobra meio pipeline e
  ninguém sabe desfazer. Um MCP que só embrulha CRUD herda o problema.
- ❌ Obriga a desenhar autenticação pública (API keys, escopos, rotação) antes de
  existir um único consumidor.
- **Veredito:** a API pública vem, mas depois e para integrações. Não é o contrato
  do builder.

**B — MCP rápido direto no banco** *(Supabase MCP, SQL, PostgREST com a service key)*

- ✅ Pronto em um dia. É, na prática, o que já fazemos: a Sprint 10 e este próprio
  estudo usaram acesso direto à produção.
- ❌ Zero guarda-corpo: o agente pode tudo, inclusive o que ninguém pediu. E a medida
  do resultado já existe — 6.193 valores fora do contrato.
- ❌ Expõe tabelas como interface; qualquer refactor de schema quebra os agentes.
- **Veredito:** para clientes, nunca. Para você, só enquanto a opção D não existir.

**C — Só o Builder dentro do app**

- ✅ Atende o cliente não técnico, que é a maioria.
- ❌ Constrói a tela antes de provar as operações — e refaz duas vezes. Cada conversa
  custa token nosso antes de sabermos o preço.
- ❌ Não resolve a sua dor: você configura por fora da UI.
- **Veredito:** é o segundo passo, não o primeiro.

**D — Contrato → núcleo de changesets → MCP interno → Builder no app → portas externas sob demanda** ✅ **Recomendada**

- ✅ Uma implementação, várias portas: o núcleo é o mesmo para você, para o Copilot,
  para o n8n e para o agente do cliente.
- ✅ Começa pelo consumidor mais seguro e com mais dor (você), pela porta que não
  precisa de UI nem de OAuth.
- ✅ Consertar o contrato já paga sozinho: os 6.193 valores da Solo Energia aparecem
  nos cards.
- ❌ Custa uma sprint de fundação antes do "efeito uau".
- **Veredito:** é o caminho coerente com o ROADMAP §6 — fatia mínima que destrava,
  manual antes de automático, evidência de cliente antes de abrir frente nova.

---

### 5. A arquitetura recomendada

```
QUEM CHAMA                  PORTA                              NÚCLEO (uma vez só)                BANCO
────────────────────        ─────────────────────────          ─────────────────────────          ─────────────────
Você no Claude Code    ──►  MCP interno (stdio, local)     ─┐
Copilot · Modo Builder ──►  chamada direta (JWT do usuário) ─┤  describe · plan · apply · revert   pipelines
n8n / integrações      ──►  REST v1 + API keys   (depois)  ─┼─► RPCs no Postgres:               ─► etapas
Agente do cliente      ──►  MCP remoto + OAuth   (depois)  ─┘  · tenant vem do token              campos
                                                               · exige papel admin/gestor         webhooks
                                                               · declarar antes de gravar         config_changesets
                                                               · passa por charge_credits         (auditoria + desfazer)
                                                               · diff, risco e inverso
```

#### 5.1 O núcleo: changeset

Um **changeset** é um documento que descreve as mudanças desejadas — "criar o
pipeline X com estas etapas", "garantir o campo `proximo_contato` do tipo data",
"criar webhook para `lead_created`". Ciclo de vida:

```
rascunho ──plan──► planejado ──(risco alto)──► aguardando aprovação ──► aplicado ──revert──► revertido
                       └────────────(risco baixo)──────────────────────────┘
```

Regras — cada uma responde a um achado da §3:

1. **`plan` não escreve nada** além do próprio plano. Valida, calcula o diff contra o
   estado atual, classifica o risco e devolve um resumo legível: *"+1 etapa 'Visita
   Técnica' depois de 'Qualificação'; +3 campos; 0 remoções"*.
2. **`apply(plan_id)` aplica exatamente o plano aprovado**, numa transação só, e só se
   o workspace não mudou desde o plano (trava otimista por versão). Não existe
   "aplicar outra coisa parecida". *(§3.1, §4-A)*
3. **Todo apply grava o inverso** — `revert` é um changeset como outro qualquer.
4. **Risco alto exige aprovação humana fora do canal do agente** — dentro do app, na
   fila de aprovações que já existe. Alto = remover ou arquivar algo que tem dados;
   mudar `stage_type` de etapa com negócios ganhos; webhook de saída para domínio
   novo. Isso derrota a injeção de prompt: o texto malicioso não clica no botão do
   app. *(§3.3)*
5. **Declarar antes de gravar:** um valor só entra em `custom_data` se o campo está
   declarado; `ensure_field` é a única forma de criar campo. *(§3.1)*
6. **Nada é apagado de verdade:** arquivar, sempre reversível.
7. **Tenant vem do token, nunca do argumento** — padrão que `routers/shape.py:82` já
   segue. Papel conferido no banco, numa fonte única. *(§3.2)*
8. **Toda porta passa por `charge_credits`**, mesmo com preço zero, porque é lá que
   tenant suspenso é recusado (`sprint81_enforcement.sql`: "a rule spread across
   callers is a rule that will be missed by the next one").

**Onde mora: RPCs no Postgres**, no padrão de `shape_pipeline` e `charge_credits`
(`SECURITY DEFINER`, validação no banco, asserções em SQL — o projeto já tem
`supabase/tests/`). Motivos: atomicidade de verdade (uma Edge Function não abre
transação pelo supabase-js); nenhuma dependência do `python-agent` nem do provedor
de LLM (§3.5); um lugar só para a regra. *Trade-off honesto:* plpgsql é verboso para
calcular diff. Se ficar pesado, o cálculo do diff pode sair para uma Edge Function —
o que **não** sai do banco é a validação e a transação do apply.

**Começa pequeno:** 6 tipos de operação — `create_pipeline`, `add_stage`,
`update_stage`, `ensure_field`, `archive` (etapa ou campo) e `create_webhook`. O
resto entra quando um onboarding real pedir.

#### 5.2 A primeira porta: MCP interno

- **Roda na sua máquina** (transporte stdio), usado pelo Claude Code. Sem
  hospedagem, sem OAuth, sem tela.
- **Autentica como você** (sessão do seu usuário no Supabase), **não** com a service
  key: cada chamada passa pelas RPCs, que conferem super admin numa fonte única de
  verdade — pré-requisito da §3.2.
- **Ferramentas**, com as anotações do MCP que dizem ao cliente o que é leitura e o
  que é destrutivo:

| Ferramenta | Faz | Anotação |
| :-- | :-- | :-- |
| `list_workspaces` | tenants que você opera | leitura |
| `describe_workspace(equipe)` | pipelines, etapas, campos (tipo, opções), campos de contato, webhooks, catálogo de eventos, contagens | leitura |
| `field_usage(equipe, pipeline?)` | declarado × usado, com contagens — o detector de deriva da §3.1 | leitura |
| `plan_changeset(equipe, changeset)` | plano, diff, risco, avisos | leitura (grava só o plano) |
| `apply_changeset(plan_id)` | aplica o plano | destrutiva, idempotente |
| `revert_changeset(changeset_id)` | desfaz | destrutiva, idempotente |
| `list_changesets(equipe)` | histórico: quem, quando, por qual porta | leitura |
| `test_webhook(webhook_id)` | disparo de teste com lead fictício (já existe em `crm-webhook`) | mundo externo |

- **Prompts do MCP = os seus playbooks por nicho.** "Onboarding de energia solar",
  "onboarding de imobiliária": o conhecimento que hoje está na sua cabeça vira um
  roteiro que o agente segue — e que o Builder do app reaproveita depois.
- **Fora da v1, de propósito:** SQL cru; leitura de mensagens e conversas (conteúdo
  não confiável, §3.3); edição de registros em massa; exclusão.

**Critério de saída**, no espírito do Marco 1 do ROADMAP: *você configura um cliente
novo — pipeline, campos, webhook — em ≤ 30 minutos pelo Claude Code, sem escrever
SQL, e desfaz tudo com um comando.*

#### 5.3 A segunda porta: Copilot em Modo Builder

- **É o Copilot, não um agente novo.** Mesmo pool de créditos, mesmo HUD de
  telemetria, mesma fila de aprovações. Um "agente builder" separado seria uma
  superfície nova e uma linha de cobrança nova para a mesma coisa.
- **Evolui o Track Shaper:** de "texto → cria pipeline" para "conversa → changeset →
  **tela de diff** → aplicar → desfazer"; de "só cria" para "cria e edita".
- Só para admin/gestor da equipe.
- A tela nova é essencialmente uma: o **diff legível com botão aplicar** — a mesma
  revisão que a sua sessão no Claude Code já terá validado.

#### 5.4 As portas externas (quando houver pedido)

- **REST v1 com API keys:** tabela `api_keys` (hash, escopos, validade, uma por
  integração, com auditoria), header `Authorization` — nunca query string. Substitui
  o `webhook_secret` aos poucos. Foco em **registros** (leads, oportunidades,
  tarefas), que é o que o n8n precisa.
- **MCP remoto com OAuth 2.1:** o Supabase Auth já funciona como servidor OAuth 2.1
  para MCP ([guia](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)),
  mas está **em beta** e registra clientes por *Dynamic Client Registration* —
  justamente o mecanismo que a revisão do protocolo de **28/07/2026** marcou como
  obsoleto em favor de *Client ID Metadata Documents*, que o Supabase ainda não
  suporta ([discussão pública](https://github.com/orgs/supabase/discussions/41695)).
  A mesma revisão tornou o protocolo *stateless* e trocou a forma de pedir
  confirmação ao usuário ([changelog](https://modelcontextprotocol.io/specification/latest/changelog)).
  Construir a porta pública agora é construir sobre areia movediça; a porta interna
  (stdio) fica isolada disso.
- **Gatilho para abrir:** o primeiro cliente ou agência que pedir para plugar o
  próprio agente. Aí o núcleo já existe e a porta é fina.

---

### 6. Riscos e como o desenho responde

| # | Risco | Exemplo concreto | Resposta no desenho |
| :-- | :-- | :-- | :-- |
| R1 | Injeção de prompt via dados | Mensagem de WhatsApp manda o agente criar webhook para fora | Ferramentas de configuração não leem conversas; webhook para domínio novo = risco alto = aprovação no app |
| R2 | Agência excessiva / destruição | "Limpa esse pipeline" some com 1.260 negócios | Sem delete; arquivar + inverso; risco alto exige humano |
| R3 | Vazamento entre tenants | Agente passa o `equipe_id` de outro cliente | Tenant vem do token; RPC confere; super admin por fonte única |
| R4 | Papel errado | Agente do vendedor reestrutura o funil | Escrita de configuração só para admin/gestor, no banco (§3.2) |
| R5 | Deriva do contrato | Agente grava `tipo_telhado` ao lado de `tipo_de_telhado` | Declarar antes de gravar, no banco; `field_usage` mostra a deriva |
| R6 | Aplicação pela metade | Falha na 14ª chamada | Changeset atômico |
| R7 | Credencial vazada | Token em URL, parado em log de proxy | Header `Authorization`; token por cliente, revogável; nada em query string |
| R8 | Custo descontrolado | Loop do agente chamando `plan` mil vezes | Limite por token; `charge_credits` no apply; limite diário de prévia no app |
| R9 | SSRF | Webhook apontando para endereço interno | Bloquear faixas privadas e exigir https na criação **e** na entrega |
| R10 | Contrato público engessado | Mudar o schema quebra agentes de clientes | Ferramentas de domínio (não de tabela), versionadas; porta pública só depois |
| R11 | LGPD | Dado pessoal indo para a IA de terceiro | Ferramentas de configuração não devolvem dado pessoal; escopo de registros separado e explícito |
| R12 | Suporte | O agente do cliente faz bagunça e o ticket cai em você | Cada changeset registra porta e autor; desfazer em um clique |

---

### 7. Créditos: quem paga o quê

| Porta | Quem paga o token | O que cobramos | Por quê |
| :-- | :-- | :-- | :-- |
| MCP interno (você) | a sua assinatura de IA | nada à parte — é custo de operação, sai da hora de Builder | aumenta a margem da hora de R$300 |
| Copilot · Modo Builder | **nós** | créditos do **pool Copiloto**, no **apply**; prévia com limite diário | cobra-se só o que o cliente aceitou |
| REST / MCP externos | o cliente | recurso de plano (ex.: Scale) + limite de uso; o apply passa por `charge_credits` com preço de 0 a 1 crédito | nosso custo é só infra |

- **Não criar carteira nova.** Já existem duas (Atendimento e Copiloto); o builder é
  Copilot.
- **Medir antes de fixar preço.** O ledger já guarda `model` e `verb`; registrar
  tokens por sessão de builder e decidir o preço depois de ~20 sessões reais.
  Chutar agora é repetir a escada de preços que a 8.1 teve de inverter.
- **O argumento de venda muda:** o Builder Mode deixa de ser "horas do founder" e
  vira "o sistema configura com você; horas humanas para o que é estratégico".

---

### 8. Decisões para o founder

| # | Decisão | Recomendo | Alternativa | Custo de errar |
| :-- | :-- | :-- | :-- | :-- |
| D1 | Identidade canônica do campo | ~~`key`~~ → **revisada em 10/09: `field_id`** (ver nota abaixo) | `key` em tudo | Com `key`: bem mais que os ~5 arquivos estimados — card, tabela, formulário, Copilot e regras de agente já endereçam por `field_id`. Com `field_id`: as bordas (webhook, dashboard, API/MCP) traduzem `key ↔ field_id` |
| D2 | Quem altera configuração | **admin/gestor**, no banco | qualquer membro (hoje) | vendedor reescrevendo o funil |
| D3 | Primeiro consumidor | **MCP interno** | Builder no app | tela construída antes das operações provadas |
| D4 | Cobrança do Builder no app | **no apply**, prévia com limite | por mensagem | cliente cobrado por explorar |
| D5 | Porta externa | **sob demanda** | já nesta sprint | construir sobre um protocolo que mudou em julho |

**Sobre D1 — revisada em 10/09, na Sprint 11 (`sprint_11_crm_v1.1.md`).** A
recomendação original era `key`. Com o código na mão, `src/types/pipelines.ts`
declara `field_id` como identidade estável e `key` como mutável, e card, tabela,
formulário, Copilot e regras de agente já usam `field_id`; a troca custaria bem mais
que o estimado aqui. Decisão: o valor mora em `custom_data[field_id]`; `key` vira
nome público **imutável**, usado só nas bordas (webhook, payload de saída,
dashboard, API/MCP), que traduzem `key ↔ field_id`; `label` é a única coisa
renomeável. O que importava na recomendação original continua valendo: **um endereço
só, e declarar antes de gravar**.

---

### 9. Sequência proposta

| Sprint | Entrega | Tier | Saída verificável |
| :-- | :-- | :-- | :-- |
| **11.0 · Contrato** | D1 aplicada; declarar os 10 campos da Solo Energia e remapear os valores; `key` imutável e única; um só lugar para dado de contato (`personal_custom_data`); escrita de configuração só para admin/gestor + fonte única de papel; resolver o webhook `meeting_scheduled` órfão; bloqueio de endereço interno em webhooks | M/L | `field_usage` da Solo Energia com 0 chave não declarada; os cards mostram "Próximo contato"; token de vendedor recebe erro ao alterar pipeline pela API |
| **11.1 · Núcleo** | `config_changesets` + RPCs `describe/plan/apply/revert` com os 6 tipos de operação; testes em SQL | XL | a configuração completa de um tenant real criada a partir de um JSON, revertida, com estado final igual ao inicial |
| **11.2 · MCP interno** | servidor stdio com as 8 ferramentas + 2 playbooks de nicho | M/L | o próximo onboarding real feito por ele em ≤ 30 min, sem SQL |
| **12 · Copilot Builder** | Track Shaper → changesets; tela de diff; aprovação para risco alto; créditos no apply | L | cliente não técnico adiciona etapa e campo conversando, vê o diff, aplica e desfaz |
| **Sob demanda** | REST v1 + API keys; MCP remoto com OAuth; catálogo de eventos (`stage_changed`, `won`, `lost`) com retry e assinatura | L/XL | primeiro pedido real de cliente ou agência |

**O importador genérico** (adiado na Sprint 10) cabe no mesmo núcleo: "declarar os
campos da planilha" é um changeset; o agente propõe o mapeamento, você aprova o
diff, e só então os registros entram. `scripts/migrate_solo_energia.py` continua
sendo a lista de requisitos.

---

### 10. O que me faria mudar de ideia

- **Clientes pedindo self-service agora** → inverter 11.2 e 12. O núcleo (11.0 e
  11.1) não muda — é justamente o que deixa essa troca barata.
- **O núcleo parecer grande demais para o volume** → começar com 3 operações
  (`ensure_field`, `add_stage`, `create_pipeline`) e crescer por demanda.
- **Uma agência parceira querendo operar vários clientes** → a porta externa sobe na
  fila, e com ela a decisão de OAuth.

---

### 11. Método e evidência

- **Código lido:** `python-agent/app/` — `routers/shape.py`, `routers/approvals.py`,
  `cascade/track_shaper.py`, `cascade/executor.py`, `cascade/field_dictionary.py`,
  `skills/core_table.py`, `guards.py`, `credits.py`, `metering.py`, `security.py`;
  `supabase/functions/` — `crm-webhook`, `tasks-api`, `deliver-crm-webhook`;
  migrations `20260608000300` (`shape_pipeline`), `20260807000000` e
  `20260807010000` (webhooks), `20260820000200`, `20260820000400` e
  `20260821000200` (planos, enforcement, builder), `20260830000800` (dashboard por
  campo); `src/` — `OpportunityCard`, `OpportunityTable`, `OpportunityDetailModal`,
  `DynamicFieldRenderer`, `CustomFieldsEditor`, `WebhookConfigModal`,
  `AuthContext`, `types/webhook.ts`.
- **Produção:** 7 consultas `SELECT` pela Management API em 10/09 — contagens, nomes
  de chave e schema de campos. Nenhum dado pessoal. Políticas de RLS lidas de
  `pg_policies`.
- **Externo:** changelog da especificação MCP (revisão 2026-07-28); guia do OAuth 2.1
  Server do Supabase para MCP; discussão pública sobre CIMD no Supabase.
- **Não verificado ao vivo:** que os cards não exibem as chaves não declaradas foi
  concluído pela leitura do código (card, tabela e modal só iteram o schema
  declarado), não abrindo o app.

---

## 🔬 Sprint Study: Verboo

> **Flag:** `Sprint Study: Verboo` · **Autor:** Verboo (DeepSeek) · **Data:** 2026-09-10
> **Tipo:** estudo de arquitetura e estratégia — **recomendação estratégica** (sem
> plano de implementação detalhado).
> **Base:** mapa de arquitetura do código em `main` (migrations, edge functions,
> `python-agent`, frontend) + pesquisa externa sobre MCP em 2026 + os achados de
> produção do estudo Claude neste mesmo arquivo — que **não** repeti: não executei
> consultas de produção.

### 0. A resposta curta

1. **"API primeiro ou MCP primeiro?" é a pergunta errada.** API e MCP são duas
   portas para o mesmo cômodo. A pergunta certa é: **qual é a unidade de mudança**
   que um agente pode fazer — e o que impede essa mudança de quebrar o cliente.
   A resposta: um **pacote de mudanças com prévia, aprovação e desfazer**
   (changeset), não CRUD solto.
2. **O código já decidiu 70% da arquitetura por nós.** Tenant vem do token;
   `charge_credits` é o ponto único de cobrança; RLS é por `equipe_id`; o Track
   Shaper já é um proto-changeset; `custom_tables` já é um proto-builder; a fila
   de aprovações já existe. O que falta não é inventar — é **generalizar o que já
   existe para a configuração inteira**.
3. **Primeiro consumidor: você.** O Builder Mode já é vendido (R$300/h). Um MCP
   interno no Claude Code encurta cada onboarding, aumenta a margem da hora de
   Builder e valida o núcleo com o operador mais confiável possível — sem UI nova,
   sem OAuth, sem custo de token nosso.
4. **Portas externas: sob demanda.** O protocolo MCP mudou em julho/2026
   (stateless, novo fluxo de confirmação, DCR → CIMD); o Supabase ainda não
   suporta CIMD. Construir a porta pública agora é construir sobre areia movediça.
   O núcleo é o que deixa essa troca barata depois.
5. **O achado de produção do estudo Claude é o argumento decisivo:** 6.193 de
   6.368 valores de campos personalizados estão em chaves que nenhum pipeline
   declara. Um MCP que exponha "gravar em `custom_data`" repete isso em cada
   cliente. **Declarar antes de gravar, no banco, é pré-requisito de qualquer
   porta.**

### 1. Por que "API vs MCP vs Builder no app" é uma falsa tricotomia

| Porta | Quem "pensa" | Quem paga o token | Público |
| :-- | :-- | :-- | :-- |
| API REST | o programa (n8n, Zapier) | ninguém — não há IA | integrações |
| MCP | o agente de quem conecta | quem conecta | você, agências, clientes técnicos |
| Builder no app | nosso modelo (Copilot) | nós — por isso cobra crédito | cliente não técnico |

Três ideias que destravam:

- **MCP não dá inteligência; dá mãos.** A pergunta não é "qual porta", é *"que
  mãos o agente pode ter e o que impede essas mãos de quebrar algo?"*
- **MCP não substitui a API — fica em cima de algo.** Se o "algo" for tabelas
  cruas, o agente vira estagiário com root. Se for operações de negócio validadas,
  vira consultor que precisa da sua assinatura para agir.
- **Quem paga o token muda o modelo de negócio.** Builder no app custa token
  nosso; MCP custa só infra. São produtos diferentes para públicos diferentes —
  **não substitutos**, e sim dois clientes do mesmo núcleo.

### 2. O que o código já decide por nós (invariantes que não devemos quebrar)

Do mapa de arquitetura em `main`:

1. **Tenant vem do token, nunca do argumento.** Toda tabela carrega `equipe_id`;
   RLS é por `equipe_id`; edge functions resolvem `auth.uid() → profiles →
   equipe_id`. Qualquer porta nova que aceite `equipe_id` como argumento é uma
   porta de vazamento entre tenants.
2. **`charge_credits` é o ponto único de cobrança**
   (`20260820000400_sprint81_enforcement.sql`): recusa tenant suspenso,
   idempotente. Toda porta nova passa por ele — mesmo com preço zero.
3. **O Track Shaper já é um proto-changeset** (RPC `shape_pipeline`): texto →
   blueprint → prévia → cria pipeline + etapas + campos numa transação. Só cria,
   não edita, não cobra, não confere papel.
4. **A fila de aprovações já existe** (`ai_decisions`, `routers/approvals.py`):
   pendente → aprovar/rejeitar → executado. Reaproveitável para changesets de
   alto risco.
5. **Webhooks já têm o esqueleto certo** (`webhook_configs` + `webhook_logs` +
   trigger → pg_net → `deliver-crm-webhook`): o que falta é retry, assinatura e
   bloqueio de endereço interno — não a arquitetura.
6. **`custom_tables`/`custom_table_records` é o proto-builder de dados** — o
   tenant define schema jsonb e grava records. O mesmo padrão de "schema declarado
   + dados" que os pipelines usam.
7. **Não há API pública nem MCP hoje** — zero menção a MCP no código. A superfície
   programática atual = edge functions (JWT / service-role / x-cron-secret) +
   webhooks de entrada com `webhook_secret`.

Conclusão: o sistema já tem o padrão *validar no banco, cobrar num ponto só,
humano no loop para o que é caro errar*. O estudo não propõe inventar — propõe
**generalizar**.

### 3. O que a indústria diz em 2026 (e como isso pesa na decisão)

- **MCP é camada fina sobre APIs existentes** — e por isso herda os problemas da
  superfície que embrulha. Embrulhar tabelas cruas = agente com root. (Qualys,
  Truto)
- **Melhor prática: read-only primeiro, escopo explícito, opt-in para escrita.**
  Limitar o raio de explosão enquanto se aprende como os agentes usam as
  ferramentas. (Truto)
- **Segurança é o tema dominante:** MCP servers são "ambientes de execução
  privilegiados" com credenciais de longa duração; o primeiro MCP malicioso real
  (postmark-mcp) já foi achado no npm. A combinação *dado privado + conteúdo não
  confiável + canal de saída* é o *lethal trifecta* — e **webhook é o canal de
  saída**. (Qualys, CSA, Semgrep)
- **O protocolo mudou em 28/07/2026:** stateless, novo fluxo de confirmação de
  usuário, e deprecação do Dynamic Client Registration em favor de Client ID
  Metadata Documents — que o Supabase ainda não suporta (OAuth 2.1 server para
  MCP segue em beta). Porta pública agora = construir sobre areia movediça.
  (changelog MCP, discussão Supabase)
- **Agente-a-agente via MCP e MCP Registry (curadoria com auditoria) são
  tendências 2026** — reforçam que o valor está no núcleo e nas ferramentas de
  domínio, não na porta.

### 4. A recomendação estratégica

**Contrato → núcleo de changesets → MCP interno → Builder no app → portas externas
sob demanda.** (Mesma direção do estudo Claude — concordo com a estratégia D, e
abaixo explico por quê e o que adiciono.)

A lógica em uma frase: **uma implementação, várias portas.** O núcleo
(describe/plan/apply/revert) é o mesmo para você no Claude Code, para o Copilot em
modo Builder, para o n8n e para o agente do cliente. Cada porta é fina; o custo
está no núcleo, e o núcleo é construído uma vez.

Por que essa ordem, estrategicamente:

1. **Consertar o contrato paga sozinho.** Os 6.193 valores da Solo Energia
   aparecerem nos cards é valor entregue antes de qualquer "efeito uau" de agente.
   É a fatia mínima que destrava tudo.
2. **MCP interno é a porta mais barata para validar o núcleo.** Sem hospedagem,
   sem OAuth, sem tela. Autentica como você (sessão Supabase, não service key),
   passa pelas RPCs que conferem papel. Critério de saída operacional: *configurar
   um cliente novo em ≤ 30 min pelo Claude Code, sem SQL, e desfazer com um
   comando*.
3. **O Builder no app é o segundo passo, não o primeiro.** Construir tela antes de
   provar as operações é refazer duas vezes. E o Builder evolui o Track Shaper
   (que já existe) em vez de criar agente novo: mesmo pool de créditos, mesma fila
   de aprovações, uma tela nova (o diff com botão aplicar).
4. **Portas externas só com pedido real.** O gatilho é o primeiro cliente ou
   agência que pedir para plugar o próprio agente. Aí o núcleo já existe e a porta
   é fina — e o protocolo MCP já terá assentado.

O que eu adiciono ao estudo Claude (ângulos que ele toca menos):

- **A âncora comercial é o SKU de Builder (R$300/h).** O MCP interno não é só
  ferramenta de dev — é o que transforma "horas do founder" em "o sistema
  configura com você". A margem da hora de Builder é o primeiro ROI mensurável.
  Isso justifica a ordem (você primeiro, cliente depois) e muda o argumento de
  venda.
- **Read-only primeiro, mesmo no MCP interno.** As ferramentas de configuração não
  devem ler mensagens/conversas (conteúdo não confiável — metade do *lethal
  trifecta*). O escopo de leitura é estrutura (pipelines, etapas, campos,
  webhooks, contagens), não conteúdo.
- **Não criar carteira nova.** Já existem dois pools (Atendimento e Copiloto); o
  builder é Copiloto. Medir tokens por sessão de builder antes de fixar preço — o
  ledger já guarda `model` e `verb`.
- **O importador genérico (adiado na Sprint 10) cabe no mesmo núcleo:** "declarar
  os campos da planilha" é um changeset; o agente propõe o mapeamento, você aprova
  o diff, os registros entram. Uma pedra, dois pássaros.

### 5. Decisões estratégicas para o founder

| # | Decisão | Recomendo | Por quê (curto) |
| :-- | :-- | :-- | :-- |
| D1 | Identidade canônica do campo | **`key`** (legível, imutável, única por pipeline); `field_id` segue como identidade interna da UI | 6.242 valores já estão por nome; contato já usa `key`; dashboard e integrações apontam para o nome |
| D2 | Quem altera configuração | **admin/gestor, no banco** (hoje é qualquer membro via RLS) | o agente do vendedor herdaria poder de reestruturar o funil |
| D3 | Primeiro consumidor | **MCP interno** | valida o núcleo com o operador mais confiável, sem UI/OAuth |
| D4 | Cobrança do Builder no app | **no apply**, prévia com limite diário | não cobrar cliente por explorar |
| D5 | Porta externa (REST/MCP) | **sob demanda** | protocolo mudou em julho; Supabase sem CIMD; sem demanda hoje |
| D6 | Onde mora o núcleo | **RPCs no Postgres** (padrão `shape_pipeline`/`charge_credits`) | atomicidade real; sem dependência do python-agent nem do provedor de LLM |

### 6. Riscos estratégicos (os que decidem a arquitetura)

| Risco | Resposta no desenho |
| :-- | :-- |
| Injeção de prompt via dados (WhatsApp manda criar webhook para fora) | ferramentas de configuração não leem conversas; webhook para domínio novo = risco alto = aprovação no app |
| Agência excessiva ("limpa esse pipeline") | sem delete; arquivar + inverso; risco alto exige humano |
| Vazamento entre tenants | tenant vem do token; RPC confere; papel por fonte única |
| Deriva do contrato (grava `tipo_telhado` ao lado de `tipo_de_telhado`) | declarar antes de gravar, no banco; `field_usage` mostra a deriva |
| Credencial vazada (token em query string) | header `Authorization`; token por cliente, revogável |
| Custo descontrolado (loop de `plan`) | limite por token; `charge_credits` no apply; limite diário de prévia |
| SSRF (webhook para endereço interno) | bloquear faixas privadas e exigir https na criação e na entrega |
| Contrato público engessado | ferramentas de domínio (não de tabela), versionadas; porta pública só depois |

### 7. O que me faria mudar de ideia

- **Clientes pedindo self-service agora** → inverter MCP interno e Builder no app.
  O núcleo não muda — é justamente o que deixa a troca barata.
- **Núcleo grande demais para o volume** → começar com 3 operações
  (`ensure_field`, `add_stage`, `create_pipeline`) e crescer por demanda.
- **Uma agência parceira querendo operar vários clientes** → a porta externa sobe
  na fila, e com ela a decisão de OAuth.

### 8. Método e evidência

- **Código:** mapa de arquitetura completo em `main` (137 migrations, 38 edge
  functions, `python-agent`, frontend) — exploração do repositório em 10/09.
- **Externo:** pesquisa sobre MCP 2026 (Truto, Qualys, CSA, Cloudflare, changelog
  da especificação, guia OAuth 2.1 do Supabase).
- **Produção:** **não** executei consultas. Os números de produção (6.193 valores
  fora do contrato, etc.) são do estudo Claude neste mesmo arquivo — trate-os como
  o âncora empírico e verifique antes de agir.
- **Não verificado ao vivo:** que os cards não exibem as chaves não declaradas foi
  concluído por leitura de código (card/tabela/modal iteram só o schema
  declarado).
