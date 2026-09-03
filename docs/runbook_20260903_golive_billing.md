# Runbook — 03/09/2026 · cobrança no go-live, exclusão de equipe e reset do WI

Deploy é manual neste projeto (não há CI). O código está **commitado e no
`main`** (`878bbca`); o Netlify publica o frontend a partir dele sozinho.

O que **falta** são os passos abaixo. A ordem importa.

> Estado quando este arquivo foi escrito: `golive-tenant` **já foi deployada**.
> As migrations **não** foram aplicadas, e as outras três functions **não**
> foram redeployadas — a permissão do agente foi negada no meio do processo.

**Isso é seguro de deixar assim por enquanto.** A `golive-tenant` nova lê
`charge_invoice_ids` e, quando o campo não existe (migration ainda não
aplicada), cai no comportamento antigo — cobra só a fatura de implantação.
Nada quebra; a primeira mensalidade só passa a sair depois do passo 1.

---

## 1. Migrations

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2-)
npx supabase db push --project-ref egxzsivzqlqadoqpgfby --dry-run   # confira a lista
npx supabase db push --project-ref egxzsivzqlqadoqpgfby
```

Devem aparecer exatamente estas três:

| Arquivo | O que faz |
| :------ | :-------- |
| `20260903000500_sprint82_golive_first_invoice.sql` | `go_live_contract()` passa a emitir a primeira mensalidade (proporcional) quando `trial_days = 0` |
| `20260903000600_sprint82_welcome_password_link.sql` | `{{link_senha}}` nas boas-vindas; `{{condicao_cobranca}}` no go-live |
| `20260903000700_sprint82_equipe_delete_cascade.sql` | as 3 FKs `NO ACTION` viram `cascade`; `admin_delete_equipe()` limpa o histórico de etapas antes do delete |

> ⚠️ **Nunca use `db push --include-all`.** Há migrations aplicadas à mão que
> não estão no histórico; `--include-all` tenta reaplicar tudo.

As três já foram **ensaiadas contra o schema e os dados reais de produção**
(`begin … rollback`) e todas as asserções passaram. Para repetir o ensaio:

```bash
python supabase/scripts/run_sql.py supabase/migrations/<arquivo>.sql
```

---

## 2. Edge functions

```bash
npx supabase functions deploy admin-billing-ops --project-ref egxzsivzqlqadoqpgfby
npx supabase functions deploy provision-tenant  --project-ref egxzsivzqlqadoqpgfby
npx supabase functions deploy public-proposal   --project-ref egxzsivzqlqadoqpgfby
```

`golive-tenant` já está no ar. As outras três mudaram porque:

- `admin-billing-ops` ganhou a ação `charge_invoice`
- `provision-tenant` e `public-proposal` compartilham
  `_shared/provision-effects.ts`, que agora manda o `redirectTo` do convite e o
  `link_senha` nas boas-vindas

---

## 3. A cirurgia de dados

**Só depois do passo 1.** O script depende do `cascade` que a `000700` cria.

```bash
# 1. ENSAIO — roda tudo e desfaz. Nenhuma linha é alterada.
python supabase/scripts/run_sql.py supabase/scripts/2026-09-03_wi_reset_e_dedup.sql --rehearse

# 2. Só se o ensaio imprimir OK:
python supabase/scripts/run_sql.py supabase/scripts/2026-09-03_wi_reset_e_dedup.sql --commit
```

### O que ele faz

| Bloco | Ação |
| :---- | :--- |
| 0 | Confere que a base ainda é a que foi conferida. Se a forma mudou, aborta antes de tocar em qualquer linha |
| 1 | Copia tudo o que vai morrer para `backup_20260903_*` |
| 2 | **Move os dois logins do WI** para a equipe nova, preenche o e-mail que faltava na proposta e na conta de cobrança, carrega o nicho |
| 3 | Apaga "Walter Inglez Advogados" (a antiga) e as duas cascas vazias de 02/09 |
| 4 | Quem fechou negócio e não está no ar volta para **Boas-vindas** |
| 5 | Emite a mensalidade que o go-live da Solo Energia não emitiu |
| 6 | Enfileira as boas-vindas que nunca saíram |

### O ponto que o pedido não mencionava

`profiles` tem `on delete cascade` para `equipes`. Apagar a equipe antiga do WI
apagaria **os dois logins do cliente junto**, e a equipe nova tem zero perfis —
ele ficaria sem nenhuma forma de entrar, sem nada acusando o erro. Por isso o
bloco 2 vem antes do 3, e a asserção final verifica exatamente isso:

```
o login wi@walteringlezadv.com.br aponta para a equipe que tem o contrato
```

Se essa asserção falhar, a transação inteira é desfeita.

### O que ele NÃO faz, de propósito

- **Não emite a implantação de R$1.000 da Solo Energia.** O contrato entrou no
  ar sem ela, e cobrar R$1.000 de surpresa é decisão comercial, não correção de
  bug. Se for para cobrar: Admin → Faturamento → Nova fatura avulsa.
- **Não emite cobrança no gateway.** SQL não fala com o Asaas. As faturas
  nascem `open` com `metadata.manual = true` (sem essa marca o `billing-cron` as
  anularia em 2h) e a cobrança sai pelo painel — veja o passo 5.

---

## 4. Confira

```sql
-- Nenhum nome de equipe duplicado, e o WI só com a equipe nova.
select nome, count(*) from equipes group by nome having count(*) > 1;

-- O login do cliente do WI está na equipe que tem o contrato.
select p.email, e.nome from profiles p join equipes e on e.id = p.equipe_id
 where p.email like '%walteringlez%';

-- A Solo Energia deixou de usar o produto de graça.
select number, kind, status, total, due_date, asaas_payment_id
  from invoices where contract_id = '5234874b-e8d2-4e5c-a739-d659737b1e53';

-- O quadro: quem fechou está em Boas-vindas.
select s.label, o.cliente_nome, o.golive_previsto
  from onboardings o join onboarding_stages s on s.id = o.stage_id
 order by s.sort_order;
```

E no painel: `/admin?tab=onboarding`.

---

## 5. Emitir as cobranças que ficaram pendentes

O script cria faturas sem cobrança no gateway. Para cada uma:

**Admin → Faturamento → menu da fatura → "Emitir cobrança no Asaas".**

Esse item só aparece em fatura aberta **sem** `asaas_payment_id` — que é
exatamente o caso. Ele usa o mesmo `ensureCharges` do provisionamento, então é
idempotente: clicar duas vezes não cobra duas vezes.

Se aparecer **"Faltam dados de cobrança: doc"**, é o CPF/CNPJ da conta —
preencha em Faturamento → Dados daquele cliente. A Rema e o WI estão sem
documento hoje.

---

## 6. Duas configurações que o produto pede

### 6.1 A instância de WhatsApp — **as boas-vindas dependem disto**

Conferido em 03/09: **os quatro remetentes** (`comercial`, `financeiro`,
`operacao`, `suporte`) estão com `whatsapp_instance = NULL`. O dispatcher cai
no secret `SOLO_PLATFORM_INSTANCE_ID`; se ele também não estiver definido, a
entrega por WhatsApp é **pulada em silêncio** e só a notificação in-app fica.

As boas-vindas que o passo 3 enfileira saem pelo remetente **comercial**.

> Admin → Notificações → Remetentes → conectar a instância do **comercial**.

### 6.2 `APP_BASE_URL` está vazio

Não é bloqueante: `tenant_public_origin()` resolve o domínio por equipe pelo
nicho, e é ele que monta o `{{link_senha}}`. O `APP_BASE_URL` só é usado como
último recurso, para equipe sem nicho nenhum.

---

## Se der errado

| Sintoma | Causa provável | O que fazer |
| :------ | :------------- | :---------- |
| `23503 ... consumo_creditos` ao apagar equipe | a `000700` não rodou | aplique a `000700` |
| `23502 ... to_stage_id` ao apagar equipe | a `000700` não rodou | idem — é ela que ensina `admin_delete_equipe()` a limpar o histórico antes |
| Go-live não emitiu a mensalidade | a `000500` não rodou | aplique a `000500`; ela é `create or replace`, pode reaplicar |
| Boas-vindas não chegam no WhatsApp | remetente `comercial` sem instância | passo 6.1 |
| `{{link_senha}}` aparece literal na mensagem | a `000600` não rodou | aplique a `000600` |
| Fatura aberta que o cliente não consegue pagar | sem cobrança no gateway | passo 5 |

Nada do passo 3 é irreversível enquanto os `backup_20260903_*` existirem. Não
apague essas tabelas até ter conferido tudo por uma semana.

---

## Um defeito de schema que ficou anotado, não corrigido

`opportunity_stage_history.to_stage_id` é `NOT NULL` e a FK dela para
`pipeline_stages_v2` é `ON DELETE SET NULL`. As duas coisas não podem ser
verdade ao mesmo tempo: no instante em que algo tenta anular a coluna, o
`NOT NULL` recusa com `23502`. É a **única** constraint do banco com esse
defeito (varrido `pg_constraint` por `confdeltype = 'n'` sobre coluna
`attnotnull`).

O efeito prático hoje: **apagar uma etapa de pipeline que já foi usada falha.**

A `000700` não mexeu nisso — trocar para `cascade` faria o CRM apagar histórico
de funil em silêncio, que é outra feature e outra decisão. `admin_delete_equipe()`
contorna limpando o histórico **da equipe** antes do delete, escopo onde perder
isso é o esperado.

Decisão pendente do fundador: ao apagar uma etapa de pipeline, o histórico
daquela etapa deve morrer junto (`cascade`) ou a coluna deve virar nullable e o
histórico sobreviver apontando para o vazio?
