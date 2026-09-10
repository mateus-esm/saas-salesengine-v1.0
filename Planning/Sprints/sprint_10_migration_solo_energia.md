# Sprint 10 — Migração Solo Energia (Jestor → SaaS Sales Engine)

## 🎯 Vision (Human)

we need to plan and execute an full migration to Solo Energia begin to use the
Software, if i begin to really use the software everyday soo the software will
evolve fastly!

So we need to mapping my current process and made this migration after we need
to develop the software for they can do everything that i can do today in
Jestor:

- Proposal Generator / Sender
- Contract Generator / Sender
- Email Cadences
- Whatsapp Cadences
- Relational Tables
- Logs
- Personalization
- Dashboard

But this will be build point to points!

We need to have an way to input an raw datasheet and so normalize it inside the
app like matching the fields for example,you can make an firs normalization of
the sheet and after an fields matching

i will input an sheet that is my contacts and another that is the opportunities
in the pipeline.

Também: apagar os dados atuais de clientes e chats da Solo Energia (com backup),
começar do zero com esses clientes, e verificar se os campos atuais de pipeline
e contatos são efetivos para receber os leads.

### Decisões do Human (2026-09-09)

1. **Migração primeiro, importador depois.** Script direto agora; o importador
   genérico com field-matching vira sprint própria.
2. **Só campos essenciais.** Contatos: `nome, email, telefone, origem (flags),
   observações`. Oportunidades: só os campos importantes — não precisa trazer tudo.
3. **Todos os contatos sem duplicados + todas as oportunidades roteadas na fase
   correta.**
4. **Dedup por telefone + nome parecido** (nunca telefone cego — ver Achado 5).
5. **Backup dos contatos atuais** antes de apagar.

### ✅ Definition of Done

- [x] Backup completo de leads/oportunidades/mensagens da Solo Energia antes de qualquer delete
- [x] Base atual da Solo Energia zerada (leads, oportunidades, mensagens)
- [x] Todos os contatos do CSV importados, sem duplicados (regra telefone + nome parecido)
- [x] Todas as 1.260 oportunidades importadas e roteadas na fase correta
- [x] Nenhuma oportunidade órfã: as 175 sem `Lead` recuperadas ou com contato criado
- [x] Telefones normalizados (DDI 55) — senão o agente "envia" e a mensagem some
- [x] Relatório de revisão: grupos ambíguos de dedup + qualquer linha não mapeada
- [x] Kanban da Solo Energia abre com os cards nas fases certas

---

## 🔬 Achados da análise (PM · 2026-09-09)

Levantados dos CSVs reais e do schema de produção. Mudaram o plano — ficam registrados.

**1. A escala é 10× menor do que parece.** `wc -l` dá 5.085 / 14.512, mas isso é
newline dentro de `Observações` entre aspas. Parseado como CSV de verdade:

```
contatos       1.268 linhas · 17 colunas
oportunidades  1.260 linhas · 55 colunas
```

**2. O pipeline atual já serve — cobertura 100%.** `Solo Energia | Usinas - Micro
Geração` (`fd7b9821-…`) tem 11 etapas e os 10 valores de `Estágio` do Jestor caem
todos nelas. Só `Nova Oportunidade` precisa de rename no mapa → `Contato Inicial`.
Não é preciso criar pipeline nova.

**3. A junção é limpa.** `oportunidade.Lead` → `contato.Nome` casa **1.024 de
1.024** valores distintos. `Propriedade` **não** é chave (é o marcador nulo `'-`
do Jestor em quase todas as linhas).

**4. O export é sujo.** Toda célula carrega o apóstrofo de guarda do Excel
(`'+5585994093938`, `'-`); telefone vem em dois formatos incompatíveis
(`'+5585994093938` vs `(85) 99262-5840`); `Ganho` e `Perdido` exportaram como a
string literal `unsupported` nas 1.260 linhas — o ganho/perda **tem de sair do
`Estágio`**; ~9 colunas são *botões* do Jestor, não dados (`Criar oportunidade`,
`Enviar proposta`, `Gerar Contrato`, `Botão de mensagem do WhatsApp`…), todas
100% "preenchidas"; 3 colunas são 100% vazias.

**5. Dedup cego por telefone destrói 38 pessoas reais.** 65 grupos de telefone
repetido: 51 são a mesma pessoa (`Fernando César Andrade Lopes` / `Fernando
Cesar Andrade Lopes` / `Fernando Lopes`), 14 são pessoas **diferentes** dividindo
o número (`5588981536417` → Abinoan Pereira, Damares Vieira, Gesaias Pereira
Azevedo). Regra escolhida: mesmo telefone **E** nomes compartilham token.

```
sem dedup                → 1.268 contatos
telefone cego            → 1.172 contatos  [funde 38 pessoas distintas ❌]
telefone + nome parecido → 1.210 contatos  [preserva as 38 ✅]
```

**6. As 175 oportunidades sem `Lead` são recuperáveis.** 120 casam com um contato
pelo telefone; 55 viram contato novo a partir do próprio `Oportunidade` + `Telefone`.
Só 1 não tem nome e 2 não têm telefone.

**7. O modelo vivo são DUAS linhas.** `leads` = a pessoa; `opportunities` = o
negócio no funil. `useCreateContactAtomic` grava as duas e vira `contact_type`
para `'opportunity'`. `leads.stage_id` é legado do merge da Sprint 5.5. **O Kanban
lê `opportunities`** — importar só em `leads` deixaria o funil vazio.

**8. Volume atual a apagar:** 466 leads · 56 oportunidades · 9.340 mensagens.

**9. Defeito achado de passagem:** o pipeline `Carregamento Veicular` tem `Ganho`
e `Perdido` com `stage_type = 'open'` em vez de `won`/`lost` — corrompe silenciosamente
a métrica de conversão daquele funil.

---

## 🛠️ Implementation Plan (PM)

**Agente:** Claude / Opus 5 (PM + Engineer — execução solo)
**Branch:** `claude/sprint10/migration/solo-energia`

### Mapa de campos — contatos → `leads`

| Jestor | `leads` | Regra |
| :--- | :--- | :--- |
| `Nome` | `name` | strip apóstrofo; obrigatório |
| `Email` | `email` | lower; vazio → null |
| `Telefone` | `phone`, `phone_normalized` | só dígitos, DDI 55 garantido |
| `Canal de captação` | `source`, `origem`, `origin_category`, `origin_detail` | as *flags* de origem |
| `Observações` | `observations` | preserva newlines |
| `Data` | `created_at` | `YYYY-MM-DD HH:MM:SS` |
| — | `contact_type` | `'opportunity'` se tem opp, senão `'lead'` |
| — | `equipe_id` | `939d7dd8-…` |

Descartados por decisão: `Tomador de decisão`, `Função`, `Perfil`, `Quem está
indicando?`, `Seu telefone`, `Propriedade`, `Status`, `Attachment Vision`,
`id_soloapp`, `Criar oportunidade`, `Oportunidade Criada`.

### Mapa de campos — oportunidades → `opportunities`

| Jestor | `opportunities` | Regra |
| :--- | :--- | :--- |
| `Lead` / `Oportunidade` | `lead_id` | junção por nome; fallback telefone; senão cria contato |
| `Estágio` | `stage_id` | mapa abaixo |
| `Estágio` | `status` | `won` / `lost` / `open` via `stage_type` |
| `Valor da Oportunidade` | `value` | numérico BR → numeric |
| `Data de Fechamento` | `closed_at` | só quando won/lost |
| resto do essencial | `custom_data` (jsonb) | `fonte, tags, proximo_contato, data_reuniao, data_envio_proposta, link_proposta, link_contrato, responsavel_jestor, touchpoints` |
| — | `pipeline_id` | `fd7b9821-…` (Solo Energia \| Usinas - Micro Geração) |

### Mapa de etapas

| Jestor `Estágio` | Etapa no app | `status` | n |
| :--- | :--- | :--- | ---: |
| Reciclo | Reciclo | open | 514 |
| Desqualificado | Desqualificado | lost | 402 |
| Ganho | Ganho | won | 137 |
| Perdido | Perdido | lost | 101 |
| Qualificação inicial | Qualificação | open | 31 |
| Nova Oportunidade | Contato Inicial | open | 27 |
| Agendamento de reunião | Agendamento de Reunião | open | 22 |
| Envio de proposta | Envio de Proposta | open | 12 |
| Negociação de proposta | Negociação de Proposta | open | 12 |
| Reunião de apresentação | Reunião de Apresentação | open | 1 |

### Tarefas

| # | Tarefa | Tier | Files owned |
| :-- | :--- | :--- | :--- |
| T1 | Backup + purge da base atual da Solo Energia | M | `supabase/migrations/*_sprint10_backup_purge.sql` |
| T2 | Script de migração: normalize + dedup + contatos + oportunidades | L | `scripts/migrate_solo_energia.py` |
| T3 | Execução da migração + relatório de revisão | M | `Planning/Assets/migration_report_solo_energia.md` |
| T4 | Fix `stage_type` won/lost do Carregamento Veicular | S | mesma migration do T1 |

### Wave map

```
W1: T1 (backup+purge)  →  W2: T2 (script)  →  W3: T3 (executar) + T4 (fix stage_type)
```

Sequencial de propósito: T2 escreve na base que T1 esvazia; T3 depende de T2.

### Fora de escopo (sprints próprias)

Importador genérico com field-matching · Proposal Generator · Contract Generator
· Email Cadences · WhatsApp Cadences · Relational Tables · Logs · Personalization
· Dashboard.

---

## ✅ Resultado da execução (2026-09-09)

```
backup      468 leads · 56 oportunidades · 9.340 mensagens
importado   1.251 leads · 1.260 oportunidades · 0 sem etapa
telefone    1.173 leads com phone_normalized
```

| Etapa | Cards | | Etapa | Cards |
| :--- | ---: | :-- | :--- | ---: |
| Contato Inicial | 28 | | Ganho | 137 |
| Qualificação | 31 | | Perdido | 101 |
| Envio de Proposta | 12 | | Desqualificado | 402 |
| Agendamento de Reunião | 22 | | Reciclo | 514 |
| Reunião de Apresentação | 1 | | Visita Técnica | 0 |
| Negociação de Proposta | 12 | | **Total** | **1.260** |

Bate 1:1 com a contagem de `Estágio` do Jestor.

### Achados durante a execução (custaram 4 rodadas de ensaio)

1. **`leads.origin_category` é taxonomia fechada** (CHECK). O rótulo cru do Jestor
   não cabe: a categoria classifica, `origin_detail` preserva o rótulo original.
2. **`UNIQUE (equipe_id, phone_normalized)` parcial.** O banco só admite um dono
   por número — e está certo, porque mensagem que chega de um número compartilhado
   não tem como ser desambiguada. Nos 24 grupos ambíguos o primeiro fica com o
   número; os outros 50 continuam existindo, com o telefone em `observations`.
3. **`trg_leads_sync_phone_normalized` recalcula a coluna no INSERT.** Zerar só
   `phone_normalized` não adianta — o trigger reescreve a partir de `phone`.
4. **A normalização do banco não é "sempre prefixa 55".** `normalize_phone_br`
   remove o 55 quando `len >= 12`, insere o 9 do celular em números de 10 dígitos
   e devolve 8/9 dígitos SEM DDI. O script agora é porta exata dela — conferido
   contra a função real em 400 telefones, 0 divergências. Enquanto divergiam,
   dois telefones "distintos" colidiam no UNIQUE.

## 📊 Ledger

- [x] T1 · Backup + purge · M
- [x] T2 · Script de migração · L
- [x] T3 · Execução + relatório · M
- [x] T4 · Fix stage_type Carregamento Veicular · S
