1. Evolve the Onboarding Process:

- I need and visual kanban in the Admin Panel for made the onboarding of the
  clients now i sent the proposals and someones accept, some clients like: Solo
  Energia, Casa Flow and Jornada do R1 already is in the software with an
  operation, so when i provisioning crrate another one! for this lets maintain
  the same enviroment, for the others: Rema Digital, WI Advogados that already
  accept can exclude the past equipe,members etc, and beggining from the begin!

- We need to habe the stages in the onboarding view, i see that the client
  receive an email talk about the fatura but in true they need to receive an
  welcome message with the link to shceduled your discovery meeting to iniate
  the implementation: https://calendly.com/mateus-soloenergia/30min, so the name
  of the software now is Solo Rev (Revenue and Revolutions of an engine so the
  objective is an Motor de Receita) lets remade the brand too of sales engine to
  rev;

- Also have an error in generate the fatura but i think that the fatura need to
  be generate after the go-live,in the onboarding have the discovery,
  implementation, and another things that we tell that will have and after it i
  click in go-live an so generate the fatura of implementation and the first
  billing after the implementation we need to make it more trustfull.

  - Think better in this processo of onboarding to be better aligned, and
    interconnection because is an software but also an service so you need to
    simplify my life too!

  - Also review the brand of the emails to be better aligned with the Solo
    Brand.

  - Also for this that already is in production like: Casa Flow, Solo Energia
    and Jornada do R1 made the reset of the plans like take off the faturas in
    abertos, system actions in the past for not poluite, they have until day 4
    (end of the validade of the proposal to regularize the new plan,after it
    will stop the agent work, this is an exception for this legacy clients, not
    an rule of the software so i dont want alter anything in the code.

---

# 🏳️ discovery_q&a

> **Flag:** `discovery_q&a` — o discovery deixa de ser uma reunião em branco e
> passa a ser um formulário que o cliente preenche antes dela.
> **Data:** 2026-09-18 · **Status:** especificado

## 🎯 Vision (Human)

Hoje o cliente aceita a proposta, recebe boas-vindas com o link do Calendly e
marca a reunião de implantação. A reunião inteira vira entrevista: pergunto o
que a empresa vende, quem é o cliente ideal, como é o funil, qual o tom do
agente — e anoto. Depois transformo a anotação em agente, CRM e canais.

O problema não é a reunião ser longa. É ela ser **transcrição**. Uma hora gasta
capturando dados que o cliente já sabia de cor, e que ele responderia melhor
sentado, com a tabela de preços aberta, do que improvisando numa chamada.

Quando o discovery chega preenchido, a reunião muda de natureza: deixa de ser
coleta e vira **decisão**. Eu chego com o funil proposto, o agente rascunhado e
as lacunas marcadas. A reunião existe para resolver conflito e exceção, não para
recopiar o que o cliente já podia ter escrito.

E há um segundo efeito, comercial: um cliente que preencheu 23 perguntas sobre a
própria operação já investiu na implantação antes de ela começar.

## 🔬 Achados (PM · 2026-09-18)

**1. O ambiente já existe quando o discovery acontece.**
`_shared/provision-effects.ts` provisiona, convida o cliente e manda
`onboarding.welcome` no **aceite**. Quando o card entra em `boas_vindas` o
cliente já tem login. O formulário não precisa criar nada — só precisa de um
lugar para gravar.

**2. As etapas já preveem o discovery.**
`onboarding_stages` está sedeada com `aceite → boas_vindas → discovery →
implantacao → homologacao → go_live → ativo`, e `onboardings` já tem
`discovery_agendado_em` e `discovery_feito_em`. Falta o conteúdo do discovery,
não o lugar dele.

**3. Existe um padrão de página pública provado, duas vezes.**
`public-proposal` (`/proposta/:codigo`) e `public-form` (`/f/:token`): edge
function com service role, token na URL, `anon` nunca toca a tabela, validação
numa RPC em vez de confiar no navegador. O discovery é o terceiro caso do mesmo
padrão — não inventa nada.

**4. A regra de tom do produto proíbe o pedido duplo.**
`20260902000300_sprint82_onboarding_notifications.sql` escreve, por extenso:
*"Um pedido só por mensagem. Boas-vindas com quatro links é uma mensagem sem
próximo passo."* Mandar "agende a reunião **e** preencha o formulário" quebra
essa regra e, na prática, produz o que se queria evitar: o cliente agenda
primeiro (é o link mais fácil) e aparece com o formulário vazio.

Por isso a ordem foi **invertida**: boas-vindas pede o discovery, e o link do
Calendly aparece na tela de conclusão do formulário. O agendamento vira a
recompensa por terminar, e não existe reunião marcada contra discovery vazio.

**5. O registro de nichos já dá os padrões de graça.**
`niches.custom_fields` (`20260407000000`) guarda campos por segmento — energia
solar tem consumo médio e valor da conta, imobiliária tem tipo de imóvel.
`proposals.niche_id` (`20260903000400`) liga a proposta ao nicho. O formulário
chega pré-moldado para o segmento do cliente sem nenhuma tabela nova.

**6. O rascunho do Codex resolve o problema errado.**
`.tmp_gptmaker_onboarding/` tem 72 perguntas em 10 blocos, ~90% `textarea`
obrigatória, num Node/HTML solto que exporta JSON por download manual e não
conversa com o produto. Duas falhas de fundo:

- **Pede composição, não correção.** *"Para cada pipeline, liste as etapas na
  ordem e explique entrada, saída e responsável de cada etapa"* é pedir que o
  cliente redija de um quadro em branco o que nós já sabemos como é. Eu conheço
  o funil de energia solar; fazer o cliente digitá-lo é cobrar dele o meu
  conhecimento.
- **Obrigatório demais para ser respondido.** 65 campos obrigatórios não
  produzem 65 respostas: produzem abandono no bloco 4, ou 65 respostas de uma
  palavra.

O que sobrevive do rascunho: o mapa resposta → configuração, a ideia do gate
antes do go-live, e a lista de saídas de implementação.

## 🏗️ Decisões

### D1 · O banco de perguntas mora no banco de dados

Tabela sedeada `discovery_questions`, no mesmo formato
`{key, label, type, options}` que `niches.custom_fields` já usa.

Não em TypeScript: o front é Vite e a edge function é Deno, e um banco de
perguntas em código teria que ser duplicado entre os dois. Banco de perguntas
duplicado é corrupção silenciosa de dado — o formulário pergunta uma coisa e a
validação cobra outra.

No banco, é uma cópia só, e o texto de uma pergunta pode ser afinado **sem
deploy** — exatamente como os templates de notificação já funcionam.

Cada pergunta carrega `maps_to` (`agent` | `crm` | `channels` | `team`): é essa
coluna que depois transforma respostas em checklist de configuração, e é ela que
diz quais perguntas sustentam peso.

`niche_id` opcional torna a pergunta específica de segmento.

### D2 · 23 perguntas, 12 de escolha, 10 já com padrão marcado

| Bloco | Perguntas | Prosa |
| --- | --- | --- |
| 1 · A empresa e a oferta | 4 | 3 |
| 2 · Quem é cliente (e quem não é) | 3 | 3 |
| 3 · Como vende hoje | 4 | 0 |
| 4 · O agente | 6 | 2 |
| 5 · Canais e acessos | 3 | 0 |
| 6 · Time e alertas | 3 | 1 |
| **Total** | **23** | **9** |

Das 23, **12 são escolha** (rádio ou caixa) e **10 dessas já abrem com uma
sugestão marcada** — funil, motivos de perda, origens, objetivo e tom do agente,
transferência, canais, agenda, horário e avisos. As duas escolhas que ficam em
branco de propósito são ticket médio e situação do número: chutar o tamanho de
uma venda ou o estado de um chip é pior do que perguntar, porque o cliente
aceitaria o palpite errado sem reparar.

As outras 11 são escritas: 10 textos longos (9 obrigatórios) e o nome do agente.

São as 23 de todo mundo. Quem é de um segmento que já conhecemos vê mais uma ou
duas, vindas de `niche_id` — consumo médio em kWh para energia solar, tipo de
imóvel para imobiliária. É o que faz o formulário parecer feito para aquele
cliente em vez de genérico, e sai de graça do registro de nichos que já existe.

Alvo: 12–15 minutos. `"a confirmar"` continua válido em qualquer campo.

A redução de 72 para 23 não é só cortar: é **inverter o esforço**. Onde o Codex
pedia redação, aqui há uma proposta pré-marcada que o cliente corrige. Escolher
entre três modelos de funil custa dez segundos; descrever seis etapas custa dez
minutos e sai pior.

### D3 · Um registro, duas portas (a terceira fica reservada)

```
onboarding_discovery        1:1 com onboarding
  token      link público; expira em 30 dias ou no envio
  answers    jsonb { [code]: value }     ← autosave por campo
  progress   % das obrigatórias respondidas
  status     draft | submitted
  source     form | json_import          ← 'copilot' entra depois, sem migration
```

Porta 1: `/discovery/:token`, rota pública fora do `ProtectedRoute`, ao lado de
`/proposta/:codigo` e `/f/:token`.

Porta 2: o ida-e-volta de JSON (D4).

Porta 3, **fora desta sprint**: o modo entrevista com o Copilot. O modelo leva
~52s por turno (sprint 11); 23 perguntas a 52s são 19 minutos de espera, o que
faria da funcionalidade-vitrine o pior jeito de preencher o formulário. Fica
para uma onda posterior, quando a entrevista puder ser um passeio roteirizado
pelo mesmo banco — com o modelo só interpretando a resposta, não decidindo a
próxima pergunta. O contrato acima já deixa a cadeira posta: ela grava o mesmo
`answers` com `source='copilot'`.

### D4 · O ida-e-volta de JSON nunca envia sozinho

**"Copiar perguntas"** entrega o banco em JSON com um preâmbulo curto mandando a
IA do cliente responder como a empresa dele e devolver o mesmo formato.

**"Colar respostas"** valida contra o banco e carrega como **rascunho com todo
campo importado destacado**. O cliente revisa e envia.

Nunca envia sozinho, e isso não é excesso de zelo: a IA do cliente vai inventar
um preço com confiança total, e preço inventado vira script do agente que fala
com o cliente final dele. O humano confirmando é o mecanismo de segurança
inteiro.

### D5 · O gate é mole

O card mostra o progresso do discovery. Mover para `implantacao` com discovery
incompleto **avisa e nomeia o que falta — não bloqueia**.

Gate duro aqui seria falso: eu mesmo furo a ordem quando o cliente pede para
conversar antes, e um quadro que me impede de registrar o que já aconteceu vira
um quadro que eu paro de usar.

## 🛠️ Implementation Plan (PM)

### Onda 1 — o banco de perguntas e o registro

- **T70 · Migration `discovery_questions` + seed das 23** — tabela, RLS (leitura
  para `authenticated`; o público passa pela function), seed idempotente com
  `maps_to`, `default_value`, `options` e os `niche_id` de energia solar e
  imobiliária.
- **T71 · Migration `onboarding_discovery`** — tabela 1:1, token
  (`gen_random_bytes`), `expires_at`, RLS fechada.

  Sem trigger em `onboardings`: quem cria a linha é `_discovery_ensure_link`,
  chamada no provisionamento e no botão do painel. Um trigger criaria a linha,
  mas o token em claro só existe dentro da transação que o gerou — e é ele que
  precisa chegar à mensagem de boas-vindas. Um caminho só, e ele devolve o link
  a quem vai mandá-lo.
- **T72 · RPCs `_discovery_get` / `_discovery_save` / `_discovery_submit`** —
  toda validação no banco, contra o banco de perguntas. `save` é parcial
  (autosave); `submit` exige as obrigatórias e carimba `submitted_at`. Link
  expirado e link já enviado têm respostas próprias.

### Onda 2 — a porta pública

- **T73 · Edge function `public-discovery`** — `verify_jwt = false`, service
  role, ações `get` / `save` / `submit`, espelhando `_shared/public-form.ts`.
- **T74 · `src/lib/discovery/`** — `bank.ts` (tipos e leitura), `evaluate.ts`
  (progresso e faltantes), `jsonRoundTrip.ts` (exportar perguntas, validar e
  normalizar respostas coladas). Lógica pura, testada isolada.
- **T75 · `src/pages/PublicDiscovery.tsx`** — 6 blocos, um por vez, autosave,
  barra de progresso, marca Solo Rev via `BRAND`, as duas portas de JSON, e a
  tela de conclusão com o link do Calendly. Rota `/discovery/:token`.

### Onda 3 — a costura com o que já existe

- **T76 · Boas-vindas pede o discovery** — migration: `link_discovery` entra em
  `notification_types.variables` de `onboarding.welcome`, template reescrito com
  um pedido só; `provision-effects.ts` monta a variável. Nova notificação
  `onboarding.discovery_done` avisa o fundador e devolve o Calendly ao cliente.
- **T77 · O quadro enxerga o discovery** — `useOnboarding.ts` traz progresso e
  status; `OnboardingCard` ganha o selo; `OnboardingSheet` ganha o painel
  Discovery (progresso, respostas em leitura, copiar link, reenviar). Junto vem
  a edge `admin-discovery-link`, autenticada: gerar um link de acesso público
  não pode partir do navegador, então a RPC continua só do `service_role` e o
  painel passa por uma função que confere o super admin antes.
- **T78 · Aviso mole ao mover para implantação** — nomeia os campos faltantes,
  permite seguir.

### Onda 4 — a saída

- **T79 · Briefing de implantação** — do `OnboardingSheet`, as respostas viram
  (a) texto de treinamento do agente e (b) checklist de CRM/canais/time,
  agrupados por `maps_to`. É o que fecha o ciclo: o formulário só vale se
  encurtar a configuração, não só a reunião.

### Fora de escopo

- Modo entrevista com o Copilot (D3, porta 3).
- Aplicar a configuração automaticamente (criar pipeline, treinar agente). O
  briefing é lido por humano nesta sprint; automatizar vem depois de as
  respostas provarem que são boas.
- `.tmp_gptmaker_onboarding/` é descartado ao fim da sprint.

## 📊 Ledger

- [ ] T70 · Banco de perguntas + seed das 23 · M
- [ ] T71 · `onboarding_discovery` + trigger em `boas_vindas` · M
- [ ] T72 · RPCs get/save/submit · M
- [ ] T73 · Edge function `public-discovery` · S
- [ ] T74 · `src/lib/discovery/` (lógica pura + testes) · M
- [ ] T75 · `PublicDiscovery.tsx` + rota · L
- [ ] T76 · Boas-vindas com um pedido só + `discovery_done` · S
- [ ] T77 · Selo no card + bloco no sheet · M
- [ ] T78 · Aviso mole ao mover para implantação · S
- [ ] T79 · Briefing de implantação · M
