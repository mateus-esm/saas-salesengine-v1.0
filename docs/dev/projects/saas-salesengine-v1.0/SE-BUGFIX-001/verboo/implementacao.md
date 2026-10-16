# SE-BUGFIX-001 — Implementação (harness Verboo)

Data: 2026-09-27
Worktree: `/srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-BUGFIX-001`
Branch: `task/SE-BUGFIX-001-support-credits-notifications`

Três bugs corrigidos. O Bug 1 (vazamento entre tenants) veio primeiro, como pedido.

---

## Bug 1 — Mensagens de ticket vazando entre equipes

### Causa raiz

A policy de leitura de `public.support_ticket_messages` era:

```sql
create policy support_messages_read on public.support_ticket_messages
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id)
  );
```

Esse `EXISTS` responde só uma pergunta: **"o ticket existe?"**. Ele nunca pergunta
**de quem** é o ticket. A subconsulta referencia `support_tickets`, que tem RLS
com filtro por equipe — mas **subconsulta dentro de policy não herda a RLS da
tabela referenciada**. O resultado é que qualquer sessão autenticada lia a
conversa de qualquer equipe.

Isso explica o sintoma exato relatado: a lista de tickets aparecia filtrada
(o hook `useSupportTickets` faz `.eq("equipe_id", equipe.id)` e a policy de
`support_tickets` filtra por equipe), mas **a conversa vazava**. O vazamento era
só na camada de RLS das mensagens, então esconder na UI não resolveria.

A policy de INSERT (`support_messages_create`) tinha o **mesmo** `EXISTS` sem
filtro: permitia inserir mensagem em ticket de outra equipe. Era a metade de
escrita do mesmo furo.

### Correção

`supabase/migrations/20260927000200_sebugfix001_support_message_isolation.sql`

O filtro passa a ser **explícito na própria condição da policy**:

```sql
exists (
  select 1
  from public.support_tickets t
  where t.id = support_ticket_messages.ticket_id
    and (
      t.equipe_id in (select p.equipe_id from public.profiles p where p.user_id = auth.uid())
      or public.has_role(auth.uid(), 'super_admin')
      or public.has_role(auth.uid(), 'owner')
    )
)
```

- `support_messages_read` (SELECT) e `support_messages_create` (INSERT) recriadas
  com a mesma condição.
- `ticket_id` passou a ser qualificado (`support_ticket_messages.ticket_id`)
  para não depender de resolução implícita de nome dentro da subconsulta.
- `has_role` lê `public.user_roles`; o vínculo equipe↔usuário vem de
  `public.profiles.equipe_id` — a mesma fonte que a policy de `support_tickets`
  já usava, então o critério é consistente entre as duas tabelas.

### `owner` — comportamento mantido, registrado como pendência

O dono disse "só quem pode ver é o próprio time e o Master admin". O papel
`owner` **também atravessa** hoje (vê todos os tickets), porque a policy de
`support_tickets` já o incluía e é o que o painel admin usa. Conforme a decisão
de 2026-09-27 em `contexto/decisions.md`, **mantive o `owner` como está** e
registro aqui. Se o dono quiser restringir, basta remover a linha
`or public.has_role(auth.uid(), 'owner')` das duas policies.

### Teste de RLS (exigido)

`supabase/tests/sebugfix001_support_message_isolation.sql` — duas equipes, quatro
identidades, seis asserções:

1. cliente da equipe A lê a mensagem do ticket A;
2. cliente da equipe A **NÃO** lê a mensagem do ticket B ← o bug;
3. cliente da equipe B **NÃO** lê a mensagem do ticket A;
4. `super_admin` lê as duas (Master admin);
5. `owner` lê as duas (comportamento mantido, documentado);
6. cliente da equipe A **NÃO** consegue **inserir** no ticket da equipe B.

O teste assume o papel `authenticated` e troca `request.jwt.claim.sub` — é o que
o PostgREST faz por requisição — então exercita a **policy de verdade**, não um
`where` de aplicação. Roda dentro de `BEGIN`/`ROLLBACK`, sem tocar dados reais.

Diferença relevante em relação ao teste existente `sesupport001_tickets.test.sql`:
lá a asserção de mensagens de outra equipe (`count(*)=0`) passa porque o ticket
**não existe** naquele contexto. Aqui o ticket da outra equipe **existe de
verdade** e pertence a ela — é o cenário que reproduz o vazamento.

O arquivo foi reescrito após revisão adversarial: a primeira versão usava
`profiles.nome` (a coluna real é `nome_completo`) e `request.jwt.claims` em vez
de `request.jwt.claim.sub`, o que faria o teste abortar antes de qualquer
asserção. Corrigido para a convenção dos demais testes do repo.

A asserção 6 também foi corrigida depois de uma segunda revisão adversarial. A
versão inicial inseria `(ticket_id, author_id, body)`, mas `authenticated` só tem
`grant insert (ticket_id, body)` (`grant insert (ticket_id, body)` em
`20260927000100:64`). Nomear `author_id` faria o Postgres levantar
`insufficient_privilege` pelo **check de privilégio de coluna**, antes de avaliar
a RLS — a asserção passaria pelo motivo errado e **passaria até com a policy
antiga**. Agora o insert nomeia só as colunas concedidas e deixa `author_id` cair
no default `auth.uid()` (`20260927000100:17`), de modo que o único motivo
possível para o bloqueio é a `WITH CHECK` da policy. Foi adicionado também um
**controle positivo**: o mesmo insert no **próprio** ticket tem de passar — sem
ele, um bloqueio genérico se disfarçaria de isolamento.

> **NÃO EXECUTADO** — ver seção "Validações". O sandbox não tem Postgres nem
> `node_modules`, então o teste foi escrito e revisado, não rodado.

---

## Bug 2 — Crédito extra exigia aplicar duas vezes

### Causa raiz

Não é o ledger, nem `admin_grant_credits`, nem `recompute_credit_balance`. É a
**UI do painel admin**.

Em `src/components/admin/billing/BillingTab.tsx`:

```ts
const [selected, setSelected] = useState<TeamBillingRow | null>(null);
...
onClick={() => setSelected(t)}          // guarda a LINHA inteira
...
<TeamBillingDialog team={selected} open={selected !== null} ... />
```

`selected` é um **snapshot congelado no instante do clique**. Ao conceder
crédito, `grant()` chama `refresh()` (invalida `admin-team-billing`), a lista é
revalidada com o saldo novo — mas `selected` continua apontando para o **objeto
antigo**. O diálogo exibe `team.whatsapp_balance` direto (sem cache local), lendo
o snapshot velho.

Resultado: o operador aplica 1000, o toast diz "Novo saldo: X" (o toast usa o
`balance` retornado pela RPC, que está certo), mas o painel **Atendimento** do
diálogo continua mostrando o saldo de antes. Parece que não funcionou → o
operador aplica de novo. Daí os **dois topups de 1000 no mesmo minuto** no ledger
da Casa Flow.

### Correção

`src/components/admin/billing/BillingTab.tsx` — passa a guardar só o **ID** e a
derivar a linha da lista viva a cada render:

```ts
const [selectedId, setSelectedId] = useState<string | null>(null);
...
const selectedRow = selectedId
  ? (teams ?? []).find((t) => t.equipe_id === selectedId) ?? null
  : null;
...
<TeamBillingDialog team={selectedRow} open={selectedId !== null} ... />
```

O saldo exibido agora vem sempre da lista revalidada, nunca de uma cópia da
abertura. O diálogo já trata `team` nulo (`if (!team) return null`), então a
transição durante o refetch é segura.

**Ponto certo da correção:** a UI, não o banco. O ledger e a RPC estavam
corretos — o `balance` retornado e o toast sempre foram verdadeiros. O que
mentia era o stat do diálogo.

---

## Bug 3 — Notificações de crédito não chegam

### Causa raiz

Os três tipos existiam (`credits.low` 80%, `credits.critical` 95%,
`credits.exhausted`), emitidos pelo `billing-cron` a partir do **saldo**. O
problema é que **nenhum deles representa o momento em que o agente realmente
para**:

- a pausa acontece no job `agentPower` (`_shared/agent-power.ts`), que roda
  **depois** do `creditAlerts` no mesmo cron;
- e ali o aviso saía com o tipo `credits.exhausted` — **o mesmo tipo** do aviso
  de saldo.

Consequência: o dono não tinha como distinguir "acabou o crédito" de "o agente
parou", e o texto de `credits.exhausted` ("O agente parou de responder
automaticamente") **afirmava uma pausa que ainda não tinha acontecido** — a
pausa só ocorre no job seguinte.

Detalhe que confirma a correção necessária: a RPC `notify` **levanta exceção**
para tipo não registrado (`raise exception 'unknown_notification_type: %'`).
Então o novo tipo **precisa** existir em `notification_types`, senão o aviso de
pausa falharia em silêncio.

### Correção

**(a) e (b) — "está acabando" e "acabou, mas o agente ainda não parou"**

`supabase/functions/billing-cron/index.ts`, ramo `total <= 0`:

- antes: título "Seus créditos acabaram" / corpo "O agente parou de responder
  automaticamente. ..."
- agora: título "Seus créditos de atendimento acabaram" / corpo "**O agente
  ainda não parou**: ele continua respondendo por um curto período e o consumo é
  descontado quando o crédito voltar. Recarregue para não deixar seus clientes
  sem resposta."

`credits.low` (80%) e `credits.critical` (95%) já estavam corretos e **não foram
alterados** — são os avisos de "próximo de acabar".

**(c) — "o agente realmente parou"**

`supabase/functions/_shared/agent-power.ts`, no ponto de pausa
(`pauseAgent` retornou `ok`), o tipo mudou de `credits.exhausted` para
**`credits.agent_paused`** (só para o motivo `no_credits`; `suspended` continua
`contract.suspended`). O corpo passou a dizer "o agente foi pausado **agora**".

`supabase/migrations/20260927000300_sebugfix001_credits_agent_paused.sql`
registra o tipo:

```sql
insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values (
  'credits.agent_paused', 'critical',
  array['in_app', 'email', 'whatsapp'], 'tenant',
  'O agente de atendimento realmente parou por falta de crédito',
  'operacao', array['equipe_id']
)
on conflict (type) do nothing;
```

`on conflict do nothing` para preservar qualquer edição feita no painel admin.

### Tolerância pós-crédito — JÁ EXISTIA, não foi inventada

Confirmado em `supabase/migrations/20260820000300_sprint81_agent_power.sql`:

- `agents_to_pause` só devolve o time quando `agent_paused_at is null` — não
  repausa quem já está pausado;
- `agents_to_resume` exige `credit_balance('whatsapp') > 0` — religa sozinho
  quando o crédito volta;
- `reset_agent_power_error` limpa o estado de erro para o time poder ser
  religado.

Ou seja, o comportamento "o agente continua um pouco e desconta quando o crédito
voltar" **já existe**: o agente segue respondendo enquanto o saldo não é checado
de novo (o cron é diário) e volta sozinho quando há crédito. **Nada disso foi
alterado.** A única mudança foi a mensagem passar a dizer a verdade sobre esse
estado — antes ela prometia uma pausa imediata que o sistema não faz.

---

## Arquivos tocados

| Arquivo | Tipo | Bug |
|---|---|---|
| `supabase/migrations/20260927000200_sebugfix001_support_message_isolation.sql` | novo | 1 |
| `supabase/tests/sebugfix001_support_message_isolation.sql` | novo | 1 |
| `supabase/migrations/20260927000300_sebugfix001_credits_agent_paused.sql` | novo | 3 |
| `src/components/admin/billing/BillingTab.tsx` | editado | 2 |
| `supabase/functions/_shared/agent-power.ts` | editado | 3 |
| `supabase/functions/billing-cron/index.ts` | editado | 3 |

Nenhum arquivo da lista de restrições foi tocado (motor de outreach,
`send-chat-message`, `start-conversation`, `crm-webhook`, `gpt-maker-webhook`,
infra de artefatos, workflows n8n). Nenhuma migration destrutiva. Sem segredos.

---

## Validações

O sandbox deste worktree **não tem `node_modules`** (`npm ci` negado) e não tem
`tsc`/`deno` globais. O Postgres do Supabase também não está acessível. Portanto
**nenhuma** validação de execução pôde rodar. Reporto honestamente:

| Validação | Resultado |
|---|---|
| Baseline `npm test` (antes) | **NÃO EXECUTADO** — `node_modules` ausente; `npm test` e `npm ci` negados pelo sandbox |
| `npm run typecheck` | **NÃO EXECUTADO** — idem |
| `npm run lint` | **NÃO EXECUTADO** — idem |
| `npm run build` | **NÃO EXECUTADO** — idem |
| `npm test` (depois) | **NÃO EXECUTADO** — idem |
| Teste SQL de RLS (Bug 1) | **NÃO EXECUTADO** — sem Postgres; arquivo escrito e revisado, não rodado |
| `src/__tests__/no-provider-branding.test.ts` | **NÃO EXECUTADO** — runner indisponível. Verificação estática manual: o único arquivo de `src/` alterado (`BillingTab.tsx`) não contém `gpt maker` (busca case-insensitive sem resultado), então o guard passaria. Nenhum arquivo novo foi criado em `src/`. |

Não inventei baseline nem resultado. O que foi possível fazer sem runner:
revisão estática linha a linha, conferência de nomes de policy/coluna contra as
migrations originais, e conferência de tipos (`TeamBillingRow.equipe_id: string`,
`TeamBillingDialog` aceita `team` nulo).

**Recomendação ao orquestrador:** rodar `npm ci && npm test`, `npm run typecheck`,
`npm run lint`, `npm run build` e aplicar
`supabase/tests/sebugfix001_support_message_isolation.sql` num banco de staging
antes do merge. O teste de RLS é o gate do Bug 1 — sem ele, o isolamento entre
tenants não está provado em execução.

---

## Revisão adversarial (verificação independente)

Duas rodadas de revisão por agente independente (`verification`), que **não**
aceitou as minhas afirmações e leu o código por conta própria. Achou dois
defeitos reais, ambos corrigidos:

1. **Bug no teste de RLS (rodada 1).** `profiles.nome` não existe — a coluna é
   `nome_completo`; e o claim era `request.jwt.claims` em vez de
   `request.jwt.claim.sub`. O teste abortaria antes de qualquer asserção, ou
   seja, o gate do Bug 1 não provaria nada. Corrigido.
2. **Asserção 6 vácua (rodada 2).** O insert nomeava `author_id`, coluna sem
   privilégio de INSERT para `authenticated`; o erro vinha do check de coluna,
   não da RLS, e a asserção passaria até com a policy antiga. Corrigido com a
   lista de colunas concedidas + controle positivo.

Veredito final da verificação: **PASS**, com a ressalva de que as validações de
execução permanecem **NÃO EXECUTADAS** por indisponibilidade do sandbox (o
verificador tentou `npm test`/`node`/`git` e todos foram negados; `node_modules`
ausente).

## Pendências

1. **Papel `owner` (Bug 1).** Mantido atravessando tenants, conforme
   `contexto/decisions.md`. O dono disse "o próprio time e o Master admin".
   Se a intenção for restringir, remover `or public.has_role(auth.uid(), 'owner')`
   das duas policies na migration `20260927000200`.
2. **Validações de execução.** Todas pendentes por indisponibilidade do sandbox
   (tabela acima). O teste SQL de RLS precisa rodar num banco real.
3. **`credits.agent_paused` em produção.** A migration registra o tipo; se o
   ambiente já tiver `notification_policies` customizadas por equipe, conferir
   se o novo tipo entra habilitado para os tenants que devem recebê-lo (o
   `notify` respeita `notification_policies`).
4. **Dois topups de 1000 no ledger da Casa Flow.** A correção impede a repetição
   futura, mas **não estorna** os 1000 créditos duplicados já lançados. Se o dono
   quiser, é um ajuste manual no ledger (fora do escopo desta task).