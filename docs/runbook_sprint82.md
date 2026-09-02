# Runbook — Sprint 8.2 · Onboarding, go-live e a marca Solo Rev

Deploy é manual neste projeto (não há CI). Esta é a ordem, e o que fazer se algo
der errado no meio.

**Tempo estimado:** 25 minutos, mais a limpeza de produção (passo 5), que pede
atenção e não deve ser feita com pressa.

---

## 0. O que esta sprint muda, em uma frase

Provisionar deixa de colocar o cliente no ar: o ambiente e a fatura de
implantação passam a existir no aceite, mas o trial e a cobrança esperam o
clique de "Colocar no ar", num kanban de 7 etapas no painel.

### Estado verificado antes de escrever isto

As migrations 000100–000500 foram **ensaiadas contra o schema e os dados reais
de produção**, dentro de `begin … rollback`. Todas as asserções passaram. O que
isso não cobre: as edge functions (typecheck e testes unitários, sim; chamada
real ao Asaas, não) e o script do passo 5, que **não foi executado nem em
ensaio** — veja o aviso lá.

### O que precisa estar conferido antes

```sql
-- Esperado hoje: 12 equipes, com 3 pares duplicados criados em 02/09.
select nome, count(*) from equipes group by nome having count(*) > 1;

-- Esperado: 4 contratos, e o da Solo Energia numa equipe SEM leads.
select e.nome, c.status, (select count(*) from leads l where l.equipe_id = e.id) leads
  from contracts c join equipes e on e.id = c.equipe_id;
```

---

## 1. Migrations

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2-)
npx supabase db push --project-ref egxzsivzqlqadoqpgfby --dry-run   # confira a lista
npx supabase db push --project-ref egxzsivzqlqadoqpgfby
```

Devem aparecer exatamente estas cinco:

| Arquivo | O que faz |
| :------ | :-------- |
| `20260902000100_sprint82_onboarding_core.sql` | `onboarding_stages` (7 etapas), `onboardings`, `onboarding_events`, trigger de histórico |
| `20260902000200_sprint82_provision_split.sql` | status `onboarding`, `target_equipe_id`, `provision_*` reescrita, `go_live_contract()` |
| `20260902000300_sprint82_onboarding_notifications.sql` | `onboarding.welcome` / `onboarding.golive`, templates, link do Calendly |
| `20260902000400_sprint82_brand_solo_rev.sql` | Solo Rev no texto que mora no banco |
| `20260902000500_sprint82_onboarding_backfill.sql` | cards dos clientes que já existem |

> ⚠️ **Nunca use `db push --include-all`.** Há migrations aplicadas à mão que não
> estão no histórico; `--include-all` tenta reaplicar tudo.

**Para ensaiar qualquer uma antes**, sem alterar nada:

```bash
python supabase/scripts/run_sql.py supabase/migrations/<arquivo>.sql
```

### O ponto de atenção desta etapa

A `000200` faz `drop function provision_tenant_from_proposal(uuid)` e recria com
dois argumentos. Entre o `db push` e o passo 2, a função deployada **antiga**
chama a nova assinatura: funciona (o segundo argumento tem default), mas com o
comportamento novo — contrato em `onboarding`, sem trial. **Não provisione
ninguém entre os passos 1 e 2.** A janela dura o tempo de um deploy.

---

## 2. Edge functions

```bash
npx supabase functions deploy provision-tenant       --project-ref egxzsivzqlqadoqpgfby
npx supabase functions deploy golive-tenant          --project-ref egxzsivzqlqadoqpgfby
npx supabase functions deploy public-proposal        --project-ref egxzsivzqlqadoqpgfby
npx supabase functions deploy notification-dispatcher --project-ref egxzsivzqlqadoqpgfby
```

`golive-tenant` é nova. As outras três mudaram porque compartilham
`_shared/billing-charges.ts`, `_shared/br-doc.ts` e `_shared/brand.ts`.

---

## 3. Frontend

```bash
npm run build
```

Netlify publica a partir do `main`. Depois do deploy, confira em uma aba anônima:

- o título da aba diz **Solo Rev — Motor de Receita**
- `/admin?tab=onboarding` mostra o quadro com os clientes já posicionados
- uma proposta pública pede CPF/CNPJ (com máscara) e recusa um inválido

---

## 4. Regenerar os tipos do Supabase

```bash
npx supabase gen types typescript --project-id egxzsivzqlqadoqpgfby > src/integrations/supabase/types.ts
```

Isso resolve **7 erros de typecheck que já existiam antes desta sprint**:
`src/integrations/supabase/types.ts` está desatualizado desde o 8.4 e não conhece
`system_settings`, `notification_senders` nem `v_admin_notification_matrix`.

Depois de rodar, dá para trocar os `supabase as any` de `src/hooks/useOnboarding.ts`
e de `ProposalsTab.tsx` pelo cliente tipado. Não é obrigatório para funcionar.

---

## 5. Limpeza de produção — a parte que apaga dado

> ⚠️ **Este script NÃO foi executado nem em ensaio.** As tentativas foram
> bloqueadas por política de permissão, o que está certo: é a única etapa que
> apaga dado de cliente pagante. **Ensaie antes de aplicar.**

Só depois dos passos 1 a 3 estarem no ar e conferidos.

```bash
# 1. ENSAIO — roda tudo e desfaz. Nenhuma linha é alterada.
python supabase/scripts/run_sql.py supabase/scripts/2026-09-02_producao_limpeza.sql --rehearse

# 2. Só se o ensaio imprimir OK:
python supabase/scripts/run_sql.py supabase/scripts/2026-09-02_producao_limpeza.sql --commit
```

`--rehearse` existe porque o script traz o próprio `begin;`/`commit;`. Sem ele o
`commit;` de dentro encerraria a transação do ensaio e a cirurgia ficaria
permanente no meio de um "teste".

### O que o script faz

| Bloco | Ação |
| :---- | :--- |
| A.1 | **WI Advogados**: fica a equipe antiga (246 leads); contrato, proposta e conta migram; a duplicata de hoje é apagada; renomeia para "WI Advogados" |
| A.2 | **Solo Energia**: fica a equipe antiga (456 leads, CPF e cliente Asaas reais); a duplicata de hoje é apagada |
| A.3 | **Rema Digital**: fica a de hoje; a de abril (4 leads, 0 membros) é apagada |
| A.4 | **Solo Teste**: apagada — o contrato em trial viraria fatura em 08/09 |
| B | **Legado** (Casa Flow, Solo Energia, Jornada do R1): faturas em aberto anuladas, `agent_action_ledger` / `credit_ledger` / `consumo_creditos` / `notifications` zerados, `valid_until = 04/09` |
| C | **Segurança**: tira `super_admin` de um cliente (veja abaixo) |

Tudo numa transação só, com cópia em `backup_20260902_*` antes de qualquer
delete, e uma verificação final que desfaz tudo se o resultado não bater.

### Por que a ordem importa

Quarenta e três tabelas apontam para `equipes` com `ON DELETE CASCADE`, e
`profiles` é uma delas. Apagar uma equipe apaga o perfil do usuário junto e o
cliente perde o login sem que nada acuse. O script move perfis, contrato,
faturas, propostas e o card **antes**, e aborta se sobrar qualquer referência.

### Bloco C — leia antes de rodar

`wi@walteringlezadv.com.br`, um cliente, está com `profiles.role = 'super_admin'`.
`is_super_admin()` lê exatamente essa coluna, e é ela que libera o RLS de
`proposals` — ou seja, **pela API esse login lê a proposta de todos os outros
clientes, com preço negociado e aceite**. A interface não mostra o painel para
ele porque `useRole` lê outra tabela (`user_roles`), e é esse descasamento que
fez o problema passar despercebido.

O bloco C estanca. A causa raiz — duas fontes de verdade para a mesma autoridade
— está no `todo.md` para um sprint próprio.

Se você preferir rodar só isso, agora, antes de tudo:

```sql
update public.profiles set role = 'owner'
 where email = 'wi@walteringlezadv.com.br' and role = 'super_admin';
```

---

## 6. Depois: confira

```sql
-- Nenhum nome de equipe duplicado.
select nome, count(*) from equipes group by nome having count(*) > 1;

-- O contrato de cada cliente está na equipe que tem os leads dele.
select e.nome, c.status, c.went_live_at,
       (select count(*) from leads l where l.equipe_id = e.id) leads
  from contracts c join equipes e on e.id = c.equipe_id
 order by leads desc;

-- Nenhum cliente com super admin.
select email, role from profiles where role = 'super_admin';

-- O quadro.
select s.label, o.cliente_nome, o.golive_previsto, o.health
  from onboardings o join onboarding_stages s on s.id = o.stage_id
 order by s.sort_order;
```

E no painel: `/admin?tab=onboarding`.

---

## 7. Configure o que o produto pede

Em **Admin → Notificações → Configurações**:

| Chave | Para que serve |
| :---- | :------------- |
| `ONBOARDING_CALENDLY_URL` | Já semeado com `https://calendly.com/mateus-soloenergia/30min`. É o `{{link_agenda}}` das boas-vindas. |
| `APP_BASE_URL` | Sem ele o `{{link_app}}` sai vazio e o botão do e-mail não leva a lugar nenhum. |
| `PLATFORM_NAME` | Já semeado com `Solo Rev`. |

E confira que o remetente **comercial** tem instância de WhatsApp: é por ele que
as boas-vindas saem.

---

## Se der errado

| Sintoma | Causa provável | O que fazer |
| :------ | :------------- | :---------- |
| `could not choose a best candidate function` ao provisionar | a `000200` não rodou, ou rodou pela metade | reaplique a `000200`; o `drop function` dela é o que resolve |
| Go-live devolve `billing_incomplete` | falta CPF/CNPJ ou e-mail na conta de cobrança | o próprio diálogo mostra o campo; preencha ali |
| Boas-vindas não chegam no WhatsApp | remetente `comercial` sem instância | Admin → Notificações → Remetentes |
| O quadro aparece vazio | a `000500` não rodou | reaplique só ela; é idempotente |
| A limpeza aborta com `ABORTADO: N referências…` | apareceu uma tabela nova apontando para `equipes` | a transação já desfez tudo; me chame antes de forçar |

Nada do passo 5 é irreversível enquanto os `backup_20260902_*` existirem. Não
apague essas tabelas até ter conferido tudo por uma semana.
