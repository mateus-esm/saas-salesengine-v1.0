# SE-REV-002 — Decisions

Record explicit decisions and their source here.

## D1 — O n8n é CONTEXTO, não alvo de mudança (2026-09-25, Mateus, via Discord)

Mateus citou o workflow n8n do Casa Flow **apenas para dar contexto**, não para
que fosse alterado. Instrução literal: *"Dont change it to not broken nothing in
production"*.

**Consequência para a execução:** nenhuma alteração em workflow n8n, em nenhum
ambiente. A recomendação não obrigatória da §4.4 do `plano.md` (baixar o
Schedule Trigger de 10 para 2 min) **NÃO deve ser aplicada agora** — fica
registrada como sugestão futura, que só se executa com aprovação explícita e
fora desta task. Se o artefato de integração citar essa recomendação, tem de
estar marcado como "não aplicar nesta entrega".

## D2 — O motor n8n atual é o caminho padronizado de envio/recebimento, e permanece (2026-09-25, Mateus)

O Lead Engine (planilha → Rev via webhook) é um workflow que ele construiu como
serviço à parte, vendido a alguns clientes. O `Solo Ventures | Sales Engine -
Whatsapp Engine v1` é o **sender temporário** dele, feito porque o Rev ainda não
tinha isso internamente.

**Decisão:** manter esse motor como caminho padronizado de send/receive **por
enquanto**, para não complicar demais. É transição, não substituição big-bang: o
n8n continua funcionando enquanto a capacidade nativa amadurece.

## D3 — O alvo é a regra/evento DENTRO do app, sem depender do n8n (2026-09-25, Mateus)

Objetivo declarado: a integração dentro do app, para o cliente configurar regras
e eventos que disparam ações — no estilo Jestor: *"entrou lead novo, se o source
== X, envia uma mensagem"*, com o cliente escolhendo **canal** e **mensagem**
(inclusive a mensagem inicial).

Ou seja: o cliente configura sozinho, sem precisar montar workflow n8n.

**Nota de escopo (a resolver):** o `plano.md` entrega o **motor** na Fase 1 e
deixa a **tela de configuração** para a Fase 2. A capacidade que ele descreve
("cliente configura a regra") é o motor; a superfície de configuração é decisão
de escopo em aberto — ver D6.

## D4 — Roteamento por provider (2026-09-25, Mateus)

- Cliente com **Solo API** → envia por lá.
- Cliente com provider de **API não oficial** (ex.: GPT Maker) → envia por lá.
- Cliente com **API oficial** → enviaria por template, mas isso **fica para
  depois** ("this we will build after").
- Casa Flow: provider é GPT Maker → roteia para o caminho certo.

Confirma a §2 do `plano.md`. O caminho oficial (Cloud API + template HSM) segue
fora de escopo, como o plano já registrava na Correção 7.

## D5 — Requisitos não negociáveis do resultado (2026-09-25, Mateus)

1. O cliente **recebe a mensagem** (entrega real, não só "disparado").
2. Quando o lead responde, **o agente começa a interação**.
3. **Sem duplicação.**
4. **Escalável** para outros clientes.
5. **Seguro** (freios anti-banimento, opt-out).

Confirma os critérios do `spec.md` e as Correções 1, 2 e 6 do plano.

## D6 — Escopo da configuração: motor AGORA + tela mínima (2026-09-25, Mateus, via Discord)

Perguntado se a configuração de regras pelo cliente entrava nesta entrega ou
depois, Mateus respondeu: **"Motor agora + tela mínima de configuração"**.

**Decisão:** a Fase 1 desta task entrega, além do motor:
- o motor completo (roteamento por provider, cadência, freios, cancelamentos)
  configurável por API/SQL, como o plano prevê;
- **mais** uma **tela mínima no app** para o cliente ligar/desligar e editar a
  sequência: escolher a porta de entrada (gatilho), o canal/provider e as
  mensagens, com enable/disable.

**Não entra agora:** a superfície completa de regras/eventos estilo Jestor
(condições compostas, múltiplos ramos, editor visual de eventos, escolha
arbitrária de ação). Isso continua Fase 2.

**Justificativa:** o dono quer que o cliente consiga configurar sozinho o caso
"entrou lead pela porta X → manda mensagem no canal Y com o texto Z", sem montar
workflow n8n. Isso é a tela mínima. Regras compostas são evolução.

**Consequência para a execução:** os passos 4–12 do `plano.md` seguem iguais, com
um passo adicional de UI depois do passo 8 (API `outreach`), já que a tela
consome `list-sequences` / `upsert-sequence` / `update-profile` / `get-trace`.
A tela NÃO deve introduzir lógica de disparo: só lê e escreve configuração.

## D7 — Enviar mensagem para lead SEM conversa ativa (2026-09-25, Mateus, áudio no Discord)

**Pedido literal:** o cliente precisa poder clicar num lead que **não tem conversa
ativa** — alguém cadastrado à mão, que veio de formulário, ou de outro lugar — e
mandar mensagem. Hoje, ao mandar mensagem para um cliente sem chat ativo, **a
mensagem não sai**: o sistema diz que o canal não está conectado. Precisa existir
um caminho para enviar pelo GPT Maker (API não oficial) **ou** pela Solo API.

**Causa raiz localizada no código** (`supabase/functions/send-chat-message/index.ts`):

1. `loadAuthorizedContext` resolve `resolvedChatId` a partir de
   `conversations.gpt_maker_chat_id`. Lead sem conversa → `resolvedChatId = null`.
2. O bloco `if (resolvedChatId)` (rota `gptmaker`, que chama
   `/v2/chat/{id}/send-message`) **não executa**.
3. Cai no ramo `if (connectedInstance && soloPhone)` — rota Solo "outbound" — que
   exige uma instância Solo conectada (`wpp_instances.status='connected'`).
4. Sem instância Solo, `connectedInstance` é `null`, e a função termina em
   `no_route | delivered=false | reason=no_delivery_route`.

**Casa Flow é exatamente esse caso**: `gpt_maker_agent_id` preenchido e
**0 instâncias Solo** (`wpp_instances` = 0 linhas, conferido em produção). Ela é
GPT Maker puro. Então hoje, para um lead da Casa Flow sem conversa, o envio
manual cai em `no_delivery_route` — e a UI mostra "Mensagem salva, mas não
entregue — verifique os canais conectados." (`Chat.tsx:328`).

**Correção:** quando não existe `chat_id`, o caminho é **abrir a conversa** via
`POST /v2/channel/{channelId}/start-conversation` do provider (a mesma capacidade
da SE-REV-001, que aceita `{phone, message}`), e não o `send-message`. Ou seja: o
`send-chat-message` passa a ter uma rota "sem chat → abre conversa com o texto".
Na Solo, abrir e mandar já são o mesmo `sendText` (rota outbound existente).

**Por que isso encaixa aqui e não é escopo novo:** é o mesmo problema que o motor
resolve — "não existe conversa, quero mandar mensagem". A diferença é o gatilho
(humano clicando vs evento). O adaptador de provider do passo 5 e o
`callStartConversation` do passo 1 são a base; esta correção é o uso deles pelo
caminho manual.

**Escopo:** entra nesta task. Passo **2b** (junto da Fase 0, porque corrige o
mesmo defeito de entrega e é deployável sozinho) e usa os adaptadores do passo 5.

**Restrição:** não quebrar o comportamento atual de quem **já tem** `chat_id` — a
rota `send-message` com `start-human` continua idêntica. É aditivo.
