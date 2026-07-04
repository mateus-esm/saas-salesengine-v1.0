# 📖 Sprint 7 — API Reference (Ground Truth)

> **Wave 0 deliverable (PM/Claude, 2026-07-04).** Fonte de verdade para as tasks T1–T12 do `sprint_7_studio_ai_v1.md`. Se uma task contradisser este doc, este doc vence — avise o PM.
>
> **Método de verificação:** payloads do whatsmiau extraídos do **código-fonte** (github.com/verbeux-ai/whatsmiau @ `3ba1089`, mesmo projeto deployado na VPS via Dokploy) — mais confiável que amostras. Endpoints GPT Maker verificados na documentação oficial. Itens que exigem chamada viva com credenciais reais estão na seção **🔴 Live Validation Pending** no final.

---

## 1. Whatsmiau (Solo API)

### 1.1 Conexão e Auth

- **Base URL:** `WHATSMIAU_BASE_URL` (secret; VPS Dokploy porta 8081 — ver checklist de infra no sprint file)
- **Auth:** header `apikey: <WHATSMIAU_API_KEY>` em TODA chamada
- **Content-Type:** `application/json`
- Router é Echo (Go). JSON unmarshal do Go é **case-insensitive** nas chaves: `{"ID": ...}` (handoff do founder, validado em produção) e `{"id": ...}` (DTO do código) funcionam. **Padronizar no formato do handoff validado: `ID`/`InstanceName`.**

### 1.2 Ciclo de vida da instância

#### Criar instância — `POST /v1/instance/create`

O DTO embute `models.Instance`, então **o webhook pode ser configurado na própria criação** (1 chamada, sem precisar do `/v1/webhook/set` em seguida):

```json
{
  "ID": "se-a1b2c3d4-vendas",
  "InstanceName": "se-a1b2c3d4-vendas",
  "webhook": {
    "enabled": true,
    "url": "https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/solo-wpp-webhook",
    "headers": { "x-webhook-token": "<WHATSMIAU_WEBHOOK_TOKEN>" },
    "base64": false,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }
}
```

- Response 2xx: a própria instância (`{ "id": "...", "webhook": {...}, ... }`).
- ⚠️ Nomes de eventos na CONFIG são UPPERCASE_SNAKE (`MESSAGES_UPSERT`); no PAYLOAD do webhook chegam lowercase-dotted (`messages.upsert`).
- Campos opcionais úteis do `models.Instance`: `rejectCall`, `groupsIgnore` (recomendado `true` — ignora grupos), `alwaysOnline`, `readMessages`.
- T1: usar `x-webhook-token` em header (suportado nativamente via `webhook.headers`) — melhor que query param.

#### Conectar / QR — `GET /v1/instance/connect/{id}`

Response (`ConnectInstanceResponse`):

```json
// Desconectado → QR gerado:
{ "base64": "data:image/png;base64,iVBORw0...", "pairingCode": "", "id": "se-..." }
// Já conectado:
{ "connected": true, "message": "..." }
```

- `base64` é um **data URI** pronto para `<img src>`.
- `?number=5511999999999` → retorna `pairingCode` (pareamento por código, sem QR) — alternativa v2, não usar na v1.
- **QR expira rápido** (~30-60s): UI deve re-chamar connect para QR novo (T8: poll 5s + botão "Gerar novo QR").
- Variante `GET /v1/instance/connect/{id}/image` retorna o QR como **imagem binária** (buffer) — opcional.

#### Status — `GET /v1/instance/connectionState/{id}` (Evolution-compat)

```json
{ "id": "se-...", "state": "open", "instance": { "instanceName": "se-...", "state": "open" } }
```

- `state`: `"open"` = conectado; `"close"`/`"connecting"` = desconectado/pareando. **T7 (health cron): usar ESTA rota**, não `connect` (connect dispara geração de QR quando desconectado).
- Rota REST equivalente: `GET /v1/instance/{id}/status`.

#### Logout — `POST /v1/instance/{id}/logout` (REST) ou `DELETE /v1/instance/logout/{id}` (Evolution-compat)

- ⚠️ O handoff do founder usa `POST /v1/instance/logout/{id}`, que **não existe** nas rotas do código atual (`POST /:id/logout` e `DELETE /logout/:id` existem). Provável versão antiga do servidor na VPS. **T1: implementar `POST /v1/instance/{id}/logout` com fallback para `DELETE /v1/instance/logout/{id}` em 404/405.** Item de live validation.
- Response: `{ "message": "..." }`.

#### Delete — `DELETE /v1/instance/delete/{id}` (validado em produção pelo founder)

- Response: `{ "message": "..." }`. Remove instância + sessão do Redis/storage.

#### Listar — `GET /v1/instance/fetchInstances` (Evolution-compat) ou `GET /v1/instance`

- Query opcional: `?id=` / `?instanceName=`. Response inclui `ownerJid` (número conectado! ex: `5511999999999@s.whatsapp.net`) — T1/T7 podem extrair `phone` daqui.

#### Webhook set/find (pós-criação) — `POST /v1/webhook/set/{instance}` / `GET /v1/webhook/find/{instance}`

```json
{ "webhook": { "enabled": true, "url": "https://...", "headers": {"x-webhook-token": "..."}, "base64": false, "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] } }
```

### 1.3 Envio de mensagens (T5 — `_shared/solo-sender.ts`)

⚠️ **Shapes diferentes do GPT Maker.** `number` aceita telefone (`5511999999999`) ou JID.

| Tipo | Rota (Evolution-compat) | Body |
|---|---|---|
| Texto | `POST /v1/message/sendText/{instance}` | `{ "number": "5511999999999", "text": "Olá!" }` |
| Imagem/Vídeo/Doc | `POST /v1/message/sendMedia/{instance}` | `{ "number": "...", "mediatype": "image"\|"video"\|"document", "media": "<URL pública>", "caption": "...", "fileName": "...", "mimetype": "image/png" }` |
| Áudio (voice note) | `POST /v1/message/sendWhatsAppAudio/{instance}` | `{ "number": "...", "audio": "<URL pública>", "encoding": true }` |

- Campo opcional `delay` (ms, máx 300000) simula digitação.
- **Response de sucesso (todas):** contém `key`:

```json
{
  "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": true, "id": "3EB0538DA65A59F6C8A751" },
  "status": "PENDING",
  "messageTimestamp": 1751654321,
  "instanceId": "se-...",
  "message": { "conversation": "Olá!" }
}
```

- **`key.id` é o `provider_message_id`** a salvar em `messages.provider_message_id` (T5) — é o WhatsApp message ID real, mesma família de ID que o GPT Maker vê no eco (base do dedup AC4).
- Mapeamento do `send-chat-message` atual → solo: `content`→`text` · `media_type 'image'|'video'|'document'`→`sendMedia` com `mediatype` · `media_type 'audio'`→`sendWhatsAppAudio` (nunca mandar caption junto de áudio, igual regra atual).

### 1.4 Webhooks recebidos (T2 — `solo-wpp-webhook`)

**Envelope comum** (`WookEvent`) — todo evento chega assim:

```json
{
  "instance": "se-a1b2c3d4-vendas",
  "event": "messages.upsert",
  "date_time": "2026-07-04T18:00:00-03:00",
  "sender": "5511888888888@s.whatsapp.net",
  "server_url": "...",
  "apikey": "...",
  "data": { }
}
```

- Resolver a instância por `payload.instance` → lookup `wpp_instances.instance_name`.
- ⚠️ O envelope inclui `apikey` do servidor — **nunca logar o payload bruto inteiro** (mascarar).
- Validar `x-webhook-token` (header configurado por nós) contra `WHATSMIAU_WEBHOOK_TOKEN`; ausente/errado → 401.

**`event: "messages.upsert"`** — `data` (`WookMessageData`):

```json
{
  "key": { "remoteJid": "5511888888888@s.whatsapp.net", "fromMe": false, "id": "3EB0..." },
  "pushName": "Maria Cliente",
  "message": {
    "conversation": "Oi, vi o anúncio de vocês",
    "imageMessage":   { "caption": "...", "mimetype": "image/jpeg" },
    "audioMessage":   { },
    "videoMessage":   { },
    "documentMessage":{ "fileName": "..." },
    "mediaUrl": "https://storage.googleapis.com/...  (SÓ se storage GCS configurado no servidor)",
    "base64": "... (SÓ se webhook.base64=true)"
  },
  "messageType": "conversation | imageMessage | audioMessage | videoMessage | documentMessage | ...",
  "messageTimestamp": 1751654321,
  "source": "android"
}
```

Extração (T2):
- `phone` = `key.remoteJid.split('@')[0]` (ignorar JIDs `@g.us` = grupos e `@broadcast`).
- `sender_type` = `key.fromMe ? 'agent' : 'customer'`.
- `content` = `message.conversation` || caption da mídia.
- `provider_message_id` = `key.id`.
- Texto: `messageType === "conversation"` (ou `extendedTextMessage` → `message.extendedTextMessage.text`).
- 🔴 **Mídia inbound:** `mediaUrl` só existe se o servidor tiver storage (GCS) configurado; senão só com `webhook.base64=true` (payload pesado). **Decisão v1: ingerir texto + registrar mídia como `content: "[Mídia recebida]"` + `media_type` detectado, sem URL, até o storage ser configurado na VPS** (item de infra pós-W0; `base64=false` na config).
- 🎯 **Bônus ads/forms:** `data.contextInfo.externalAdReply` traz `ctwaClid`, `sourceUrl`, `conversionSource` quando o lead veio de anúncio click-to-WhatsApp — logar no lead (`source`) quando presente; útil para atribuição (pós-v1 formalizar).

**`event: "connection.update"`** — `data` (`WookConnectionUpdateData`):

```json
{ "instance": "se-...", "state": "open", "statusReason": 200, "wuid": "5511999999999@s.whatsapp.net", "profileName": "Solo Business" }
```

- `state: "open"` → `status='connected'`, `phone = wuid.split('@')[0]`, primeira vez seta `billing_active=true`.
- `state: "close"` → `status='disconnected'`. `state: "connecting"` → `awaiting_qr`.
- Demais eventos (`messages.update`, `contacts.upsert`, `messages.delete`): 200 ignored na v1.

---

## 2. GPT Maker (AI Engine)

Base `https://api.gptmaker.ai/v2` · `Authorization: Bearer <GPT_MAKER_TOKEN>` · IDs por tenant: `equipes.gpt_maker_agent_id`, `equipes.workspace_id`.

### 2.1 Canais (T3/T9)

| Ação | Endpoint | Body / Params | Response |
|---|---|---|---|
| Criar | `POST /v2/agent/{agentId}/create-channel` | `{ "name": "...", "type": "WHATSAPP"\|"INSTAGRAM"\|"CLOUD_API"\|"TELEGRAM"\|"WIDGET"\|"MESSENGER"\|"MERCADO_LIVRE" }` | `{ "id", "name", "type" }` |
| Listar | `GET /v2/workspace/{wsId}/channels?agentId=` (já em uso) | — | array de canais |
| Remover | `DELETE /v2/channel/{channelId}` | — | `{ "success": true }` |
| QR code | `GET /v2/channel/{channelId}/qr-code` | — | desconectado: `{ "value": "<string do QR>" }` · conectado: `{ "connected": true }` |
| Iniciar conversa | `POST /v2/channel/{channelId}/start-conversation` | `{ "phone", "message" }` ou `{ "phone", "image"\|"video"\|"audio" }` ou `{ "phone", "document", "documentName", "documentMimetype" }` | `{ "success": true }` |

- ⚠️ **QR do GPT Maker**: `value` é a **string do QR** (não data URI). T9 renderiza com lib de QR já presente no projeto ou `<img>` via serviço — verificar `package.json` por `qrcode.react`/similar antes de adicionar dep (dono do T9 confirma com PM).
- 🔑 **`start-conversation` SÓ funciona em canais WhatsApp NÃO-OFICIAIS** (doc oficial: "iniciar a conversa só está disponível para canais do tipo Whatsapp não oficial"). Confirma a arquitetura: canal coexistence/oficial não inicia conversa → Solo API é o caminho de outbound-initiated (Rota C do T5). Se o tenant tiver canal não-oficial no GPT Maker (ex: Z-API legado), `start-conversation` é um fallback alternativo — **v1 não implementa**; Solo API é o caminho.
- Erros: 400 `{ "error" }` (payload), 403 `{ "error" }` (token). Repassar `error` como `message` legível (T3).

### 2.2 Intenções (T4)

CRUD em `/v2/agent/{agentId}/intentions` (GET/POST) e `/v2/agent/{agentId}/intentions/{id}` (PUT/DELETE — confirmar path do id na doc ao executar T4). Body do create/update:

```json
{
  "description": "Agendar reunião",
  "details": "Quando o cliente pedir para falar com um humano ou agendar demo",
  "type": "WEBHOOK",                      // WEBHOOK | INSTRUCTIONS
  "httpMethod": "POST",                   // GET | POST (obrigatório p/ WEBHOOK)
  "url": "https://...",
  "autoGenerateParams": false,
  "autoGenerateBody": false,
  "instructions": "…",                    // p/ type INSTRUCTIONS
  "fields": [ { "name": "Data", "jsonName": "date", "description": "…", "type": "DATE_TIME", "required": true } ],
  "headers": [ { "name": "x-api-key", "value": "…" } ],
  "params":  [ { "name": "source", "value": "crm" } ],
  "variables": [ { "valueExpression": "{{contact_phone}}", "defaultFieldKey": "contact_phone" } ]
}
```

- `fields[].type`: STRING | URL | DATE_TIME | DATE | NUMBER | BOOLEAN.
- `variables[].defaultFieldKey`: chat_id, contact_name, contact_phone, contact_email, contact_gender, contact_birthday, contact_job_title, contact_org_name, contact_org_state, contact_org_city.
- Response create: `{ "success": true }`.

### 2.3 Envio / janela (T5)

- Envio atual (mantido): `POST /v2/chat/{chatId}/send-message` + `PUT /v2/chat/{chatId}/start-human` — ver `send-chat-message/index.ts`.
- 🔴 **Assinatura exata do erro de janela fechada: pendente de captura viva** (precisa de um canal coexistence com janela >24h vencida). Até lá, T5 usa a regra conservadora já especificada: **qualquer non-2xx do send-message** com instância Solo conectada + lead com phone → fallback `sendViaSolo`. Capturar o body do erro no primeiro caso real e refinar o match (registrar aqui).

---

## 3. Mapa de implicações → tasks

| Descoberta | Impacto |
|---|---|
| Webhook configurável na criação da instância (inline) | T1: 1 chamada em vez de 2; `x-webhook-token` via `webhook.headers` |
| `connectionState` não gera QR; `connect` gera | T7 usa `connectionState`; T1/T8 usam `connect` |
| `ownerJid` no fetchInstances / `wuid` no connection.update | `phone` da instância sem chamada extra |
| `key.id` presente no send response E no webhook | dedup AC4 por `provider_message_id` é viável dos dois lados |
| Mídia inbound exige GCS no servidor | v1: placeholder `[Mídia recebida]`; infra item pós-W0 |
| `start-conversation` só p/ canais não-oficiais | Rota C (outbound) é exclusiva da Solo API na v1 ✔ decisão validada |
| QR GPT Maker é string; QR whatsmiau é data URI | T8 `<img src>` direto; T9 precisa render de QR string |
| Rota de logout divergente do handoff | T1: POST REST com fallback DELETE evo |

## ✅ Live Validation — Executada 2026-07-04 (PM, VPS `72.61.219.156:8081`)

- [x] `fetchInstances` → servidor = código-fonte atual (rotas do swagger `/swagger/doc.json` batem 1:1 com o repo). Shape confirmado: `ownerJid` presente (ex: `5585...@s.whatsapp.net`). 2 instâncias de produção existentes: `solobusiness`, `soloventures-salesengine-admin` (**não tocar**).
- [x] Create `se-spike-test` com webhook inline → **aceito em 1 chamada**; `GET /v1/webhook/find` ecoa a config (url, headers, events) ✓
- [x] Logout: **ambas as rotas retornam 200** (`POST /v1/instance/{id}/logout` E `DELETE /v1/instance/logout/{id}`) — primary+fallback do T1 válidos ✓
- [x] Connect → QR: `{"message":"If instance restart...","base64":"data:image/png;base64,iVBOR..."}` — **data URI PNG confirmado** (2.4KB) ✓
- [x] 🆕 **ACHADO: `connectionState` retorna `state: "qr-code"`** enquanto aguarda pareamento (não estava no mapeamento derivado do código). Mapeado para `awaiting_qr` em T1 (status) e T2 (connection.update) via PM fixup. Estados confirmados: `open` | `close` | `connecting` | `qr-code`.
- [x] Delete `se-spike-test` → `{"message":"instance deleted"}` ✓
- [x] ⚠️ Body do n8n do founder (`{"number","textMessage":{"text"}}`) é formato legado — o servidor atual espera **`{"number","text"}`** (swagger + source). T5 usa o shape deste doc §1.3.

### 🔴 Ainda pendente (exige QR scan real / GPT_MAKER_TOKEN — fazer no início da Wave 2/T12)

- [ ] Escanear QR real → capturar sequência `connection.update` (qr-code→connecting?→open) + `messages.upsert` verbatim de mensagem recebida
- [ ] `sendText` real → confirmar `key.id` no response (requer número de destino de teste)
- [ ] Eco de coexistence: mensagem via Solo em número também no GPT Maker → verificar dedup no `gpt-maker-webhook` (AC4)
- [ ] GPT Maker: capturar erro exato de janela fechada (status + body) → refinar match do T5 (até lá: fallback em qualquer non-2xx)
