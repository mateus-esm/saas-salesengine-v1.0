# SE-REV-002 — Revisão adversarial

Data: 2026-09-25  
Escopo revisto: commits `bad1824` até `668b557`

## Veredito executivo

A arquitetura é defensável como fundação de um produto multi-tenant: banco como
fonte de verdade, unicidade e claim no PostgreSQL são escolhas mais robustas do
que timers em Edge Functions ou idempotência em TypeScript. Ela não está,
porém, pronta para ativação ampla. Há duas lacunas de correção antes do go-live:

1. `sent` é aceitação síncrona do endpoint, não comprovação de que a mensagem
   chegou ao aparelho. Isso não satisfaz literalmente a D5.1.
2. `upsert-sequence` grava sequência, passos e desativações em operações
   separadas. Uma sequência ativa pode observar passos antigos ou parcialmente
   atualizados se houver falha ou evento concorrente.

O código pode ser mergeado e até publicado inerte, porque cron e sequências
nascem desligados. Não recomendo ativar um tenant real antes das mudanças e dos
smokes listados no fim.

## 1. A arquitetura é a melhor abordagem?

Para a parte difícil — concorrência, cancelamento e não duplicação — a fila no
PostgreSQL é uma escolha boa. O sistema já depende de Supabase/Postgres, os
eventos relevantes já terminam em tabelas e as constraints sobrevivem a retry,
crash e dois workers. Um scheduler puramente TypeScript seria mais simples no
papel e menos seguro na prática.

O ponto contestável é usar muitos triggers de domínio como barramento de
eventos. Eles cobrem produtores antigos sem alterar todos os chamadores, mas
misturam regras de negócio com tabelas quentes e engolem exceções para proteger
a escrita original. O resultado seguro é “não derruba o CRM”, porém a falha pode
virar perda silenciosa de outreach.

Um caminho mais simples e observável seria um **outbox transacional único**:
produtores escrevem `domain_events` na mesma transação; um consumidor idempotente
transforma eventos em inscrições/jobs. Isso reduziria triggers específicos e
permitiria replay e alerta. Não é uma troca gratuita agora: exigiria adaptar
todos os produtores e é incompatível com a decisão de manter os caminhos
existentes sem big-bang. Portanto eu manteria a fila atual no curto prazo, mas
colocaria outbox como direção de arquitetura em vez de adicionar mais triggers.

## 2. Onde o plano superdimensionou

- Cinco tabelas, diversas RPCs e nove triggers são muito para o primeiro caso
  “porta X → mensagens Y”. Parte da complexidade vem de antecipar mudança de
  etapa, fechamento e reenrollment antes de validar entrega ponta a ponta.
- Resolver a lista de canais GPT Maker ao vivo em cada job aumenta latência e
  dependência do provider. Cache curto ou resolução validada no perfil reduziria
  uma chamada externa por mensagem.
- Manter ao mesmo tempo a abertura legada e o motor novo exige uma consulta de
  arbitragem no `crm-webhook`. É o preço da transição D2, mas amplia estados e
  possibilidades de diagnóstico.
- `stage_entered` existe na API/banco, enquanto a tela mínima só opera
  `lead_intake`. Isso é capacidade sem superfície operacional nesta entrega.

## 3. Onde o plano subdimensionou

- **Recibo de entrega:** `classifyGptMakerResult` considera `result.ok`, e o
  Solo considera presença de `key.id`. Nenhum caminho correlaciona status
  assíncrono de entregue/lido. A coluna/status chama isso de `sent`, mais forte
  que a evidência disponível.
- **Atualização atômica de configuração:** em `outreach/index.ts`, o upsert de
  `cadence_sequences`, o upsert de `cadence_steps` e a desativação dos removidos
  são três escritas. Uma queda intermediária pode deixar sequência ativa com
  conteúdo errado.
- **Rate limit concorrente:** `crm_outreach_line_usage` conta jobs já
  `sent|unknown`, mas a verificação e o envio não reservam slot atomicamente.
  Dois workers podem ambos ver espaço e ultrapassar o limite.
- **Corrida com resposta:** cancelamento altera jobs `queued`; um job já
  `running` pode ser enviado mesmo se o lead responder entre claim e chamada ao
  provider. A janela é pequena, mas existe.
- **Consentimento e conformidade:** opt-out reativo não substitui prova de
  consentimento, política de retenção, identificação do remetente e regras por
  jurisdição.
- **Anti-banimento:** janela e teto por hora ajudam, mas faltam warm-up,
  limite diário, jitter, pausa por taxa de erro/bloqueio e circuit breaker por
  linha. Um máximo configurável de 500/h não é por si só seguro.
- **Observabilidade:** warnings de trigger e jobs `unknown/failed` não geram
  alerta. Não há dead-letter workflow, métrica de fila vencida ou alarme por
  provider.
- **Edição em voo:** jobs guardam `step_id` e renderizam o template no momento
  do envio. Editar um passo altera o texto de inscrições já existentes. Isso
  precisa ser regra de produto explícita ou snapshot do template no job.
- **Rollback:** migrations são aditivas, mas não há down migration. O rollback
  real é operacional: desligar cron/sequências e reverter funções.

## 4. Decisões do plano que eu refutaria

### 4.1 “Provider aceitou” não deve ser chamado de entrega real

`gptmaker.ts` marca `sent` para HTTP aceito; `solo.ts` marca `sent` quando há
`providerMessageId`. Isso prova aceite, não chegada. Eu mudaria o domínio para
`accepted → delivered|failed` quando houver webhook de status. Se o provider
não expõe recibo, documentaria a limitação e não afirmaria D5.1 como cumprida.

### 4.2 O freio por consulta não é limite rígido

O worker faz `lineUsage(line.key) >= max` e só depois envia. Sem reserva no
banco, esse limite é aproximado sob múltiplos workers. Eu criaria uma RPC que
reserve atomicamente um slot por linha/janela ou serializaria por advisory lock.

### 4.3 Engolir toda exceção de trigger não basta como confiabilidade

`exception when others then raise warning` protege a escrita do CRM, o que é
correto, mas não cria replay. Eu manteria a proteção e acrescentaria outbox ou
registro persistente de falha; warning de banco raramente vira ação operacional.

### 4.4 Repetir `start-conversation` em cada passo GPT Maker é uma hipótese

O worker não reutiliza `gpt_maker_chat_id` para `/send-message`; cada passo usa
`start-conversation`. O próprio plano reconhece que o comportamento do provider
é desconhecido. Eu restringiria GPT Maker a passo 0 até o smoke provar a
semântica, ou implementaria passo seguinte por chat id depois de receber e
correlacionar o webhook.

### 4.5 Configuração ativa precisa ser transacional

Não aceito sequência ativa antes de todos os passos estarem consistentes. A
solução preferida é uma RPC transacional de upsert completo. A alternativa
mínima é salvar a sequência inativa, gravar/desativar passos e ativá-la por
último, com falha mantendo-a inativa.

## 5. As sete decisões do dono

| Decisão | Estado | Evidência/ressalva |
| --- | --- | --- |
| D1 — n8n é contexto | atendida | nenhum arquivo/workflow n8n foi alterado; recomendação de schedule marcada para não aplicar |
| D2 — n8n permanece | atendida | `crm-webhook` continua a porta; capacidade nova é aditiva |
| D3 — regra no app | atendida | motor por porta + API + `/outreach` |
| D4 — provider correto | atendida com pendência operacional | router sem fallback suporta GPT Maker não oficial e Solo; oficial recusado; tipo real do canal piloto ainda precisa ser consultado |
| D5 — entrega, agente, não duplicar, escala, segurança | parcialmente atendida | unicidade/cancelamento/opt-out existem; entrega real não é comprovada; agente depende de webhook e flag; rate limit não é rígido |
| D6 — motor + tela mínima | atendida | tela só lê/escreve API, sem lógica de disparo |
| D7 — manual sem conversa | atendida em código | abre/persiste GPT Maker ou Solo; ramo com chat permanece; falta smoke real |

Nenhuma decisão foi deliberadamente contrariada. A D5 foi implementada até o
limite da API síncrona, mas não pode ser declarada integralmente cumprida.

## 6. Riscos de produção adicionais

### Banimento da linha

Canal não oficial, texto repetitivo e cadência curta aumentam risco. Começar com
um tenant interno, limite baixo, janela comercial, textos variáveis legítimos e
monitoramento manual. Pausar automaticamente a linha por sequência de erros ou
bloqueios é recomendação antes de escala.

### Duplicação

As constraints protegem a fila. Ainda há duplicação possível fora do banco:
provider aceita e a conexão cai antes da resposta; o código corretamente marca
`unknown` sem retry. O envio manual não tem a mesma máquina de estados completa,
então erro de persistência após aceite pode induzir novo clique humano. O smoke
deve testar timeout e repetição deliberada.

### Opt-out

O matching exato evita falso positivo em “não quero parar”, mas perde frases
como “por favor, pare de mandar”. É uma decisão conservadora que exige canal
alternativo de descadastro e instrução clara no texto. Também falta re-opt-in
auditável.

### Ordem de deploy

Aplicar cron antes do worker/segredo gera fila sem consumo ou chamadas 401.
Publicar UI antes da API/migration quebra configuração. Mergear esta branch sem
a PR #44 quebra dependências. A ordem documentada em `implementacao.md` é
obrigatória.

### Rollback

Não remover tabelas para voltar atrás. Desagendar cron e desligar sequências
primeiro, depois reverter funções/UI. Jobs `running` podem já ter chegado ao
provider; tratá-los como incertos e nunca reenviar automaticamente.

## 7. Mudanças solicitadas

Antes de ativar produção:

1. tornar `upsert-sequence` + passos uma transação, com ativação por último;
2. renomear/modelar `sent` como `accepted` ou integrar recibo de entrega e só
   então afirmar entrega real;
3. executar smoke de duas aberturas GPT Maker para o mesmo número e restringir
   múltiplos passos caso falhe;
4. executar smoke inbound dos dois providers e confirmar início do agente e
   classificação correta do eco;
5. tornar o limite por linha atômico antes de mais de um worker/tenant em
   volume;
6. criar alertas para fila vencida, `unknown`, falhas repetidas e warnings de
   inscrição;
7. definir consentimento, política de re-opt-in e ramp-up por linha antes de
   escalar.

CHANGES_REQUESTED
