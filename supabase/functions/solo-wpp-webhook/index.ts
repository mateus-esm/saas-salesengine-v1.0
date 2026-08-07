// ============================================================================
// Sprint 7 T2 — Solo API (whatsmiau) inbound webhook.
//
// Receives Evolution-format events from whatsmiau Solo API and processes
// them identically to the gpt-maker-webhook pipeline.
//
// Event types handled:
//   CONNECTION_UPDATE — sync instance connection state to wpp_instances.
//   MESSAGES_UPSERT   — ingest inbound WhatsApp messages into leads /
//                       conversations / messages.
//
// Design principles:
//   - Never log the raw envelope (contains apikey).
//   - Always return 200; never 5xx (whatsmiau retries on non-200).
//   - Unknown instance → 200 {ignored: true} (don't leak server state).
//   - Group/broadcast JIDs silently skipped.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resolveActiveOpportunity } from "../_shared/opportunities.ts"
import { normalizePhone } from "../_shared/phone.ts"

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<void>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, x-webhook-token, content-type',
}

// ============================================================================
// Types for the Evolution API payload shapes
// ============================================================================

interface WookEvent {
  instance: string
  event: string
  date_time?: string
  sender?: string
  server_url?: string
  apikey?: string
  data: Record<string, unknown>
}

interface ConnectionUpdateData {
  state: string
  statusReason?: number
  wuid?: string
  profileName?: string
}

interface MessageKey {
  remoteJid: string
  fromMe: boolean
  id: string
}

interface MessagesUpsertData {
  key: MessageKey
  pushName?: string
  message?: {
    conversation?: string
    imageMessage?: { caption?: string; mimetype?: string }
    audioMessage?: Record<string, unknown>
    videoMessage?: { caption?: string; mimetype?: string }
    documentMessage?: { fileName?: string; mimetype?: string }
    extendedTextMessage?: { text?: string }
  }
  messageType?: string
  messageTimestamp?: number
  source?: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract a safe loggable subset from the event payload.
 * Never includes apikey, server_url, or raw data blobs.
 */
function maskPayload(instance: string, event: string, keyId?: string): Record<string, unknown> {
  const masked: Record<string, unknown> = { instance: instance?.substring(0, 20), event }
  if (keyId) masked.keyId = keyId?.substring(0, 12)
  return masked
}

/**
 * Detect whether a remoteJid is a group (@g.us) or broadcast (@broadcast).
 */
function isGroupOrBroadcast(remoteJid: string): boolean {
  return remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')
}

/**
 * Extract phone from a WhatsApp JID (strip @s.whatsapp.net suffix).
 */
function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0]
}

/**
 * Detect media type from messageType string.
 */
function detectMediaType(messageType: string | undefined): string | null {
  if (!messageType) return null
  const lower = messageType.toLowerCase()
  if (lower.includes('image')) return 'image'
  if (lower.includes('audio') || lower === 'ptt') return 'audio'
  if (lower.includes('video')) return 'video'
  if (lower.includes('document')) return 'document'
  return null
}

/**
 * Extract text content from a WhatsApp message object.
 */
function extractTextFromMessage(message: Record<string, unknown> | undefined): string {
  if (!message) return ''
  const conv = message.conversation
  if (typeof conv === 'string' && conv.trim()) return conv.trim()
  const img = message.imageMessage as { caption?: string } | undefined
  if (img?.caption) return img.caption.trim()
  const vid = message.videoMessage as { caption?: string } | undefined
  if (vid?.caption) return vid.caption.trim()
  const doc = message.documentMessage as { caption?: string } | undefined
  if (doc?.caption) return doc.caption.trim()
  const ext = message.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text.trim()
  return ''
}

// ============================================================================
// Server
// ============================================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const sendResponse = (body: unknown, status = 200): Response => {
      return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      })
    }

    // ── 1. Validate webhook token (header OR ?token= query param) ──
    // whatsmiau armazena webhook.headers mas o dispatcher (event_emitter.go
    // doEmit) só envia Content-Type — os headers configurados nunca chegam.
    // Por isso o token viaja na URL (?token=), configurada pelo
    // manage-solo-instances. O header segue aceito caso o upstream corrija.
    const headerToken = req.headers.get('x-webhook-token')
    const queryToken = new URL(req.url).searchParams.get('token')
    const providedToken = headerToken || queryToken
    const expectedToken = Deno.env.get('WHATSMIAU_WEBHOOK_TOKEN')
    if (!providedToken || !expectedToken || providedToken !== expectedToken) {
      console.log('[solo-wpp] Token invalido ou ausente (401)')
      return sendResponse({ error: 'Unauthorized' }, 401)
    }

    // ── 2. Parse payload ──
    const payload: WookEvent = await req.json()
    const { instance: instanceName, event: eventType, data: eventData } = payload

    // Never log the raw envelope (contains apikey).
    console.log('[solo-wpp] Evento recebido:', JSON.stringify(maskPayload(instanceName, eventType)))

    if (!instanceName || !eventType) {
      console.log('[solo-wpp] Payload invalido: sem instance ou event')
      return sendResponse({ ignored: true, reason: 'invalid_payload' })
    }

    // ── 3. Resolve instance from wpp_instances ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: wppInstance, error: instanceError } = await supabase
      .from('wpp_instances')
      .select('id, equipe_id, status, phone, ingest_inbound, billing_active')
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (instanceError) {
      console.error('[solo-wpp] Erro buscando instancia:', instanceError)
      return sendResponse({ ignored: true, reason: 'instance_lookup_error' })
    }

    if (!wppInstance) {
      console.log('[solo-wpp] Instancia desconhecida:', instanceName?.substring(0, 20))
      return sendResponse({ ignored: true, reason: 'instance_not_found' })
    }

    const equipeId = wppInstance.equipe_id
    const instanceId = wppInstance.id
    console.log('[solo-wpp] Instancia resolvida:', { instanceId, equipeId, status: wppInstance.status })

    // ── 4. Route by event type ──

    if (eventType === 'CONNECTION_UPDATE' || eventType === 'connection.update') {
      return await handleConnectionUpdate(supabase, wppInstance, eventData as unknown as ConnectionUpdateData)
    }

    if (eventType === 'MESSAGES_UPSERT' || eventType === 'messages.upsert') {
      return await handleMessagesUpsert(supabase, wppInstance, eventData as unknown as MessagesUpsertData)
    }

    // MESSAGES_UPDATE / CONTACTS_UPSERT: ignored in v1
    if (eventType === 'MESSAGES_UPDATE' || eventType === 'messages.update' ||
        eventType === 'CONTACTS_UPSERT' || eventType === 'contacts.upsert') {
      console.log('[solo-wpp] Evento ignorado na v1:', eventType)
      return sendResponse({ ignored: true, reason: 'event_not_handled_v1' })
    }

    // Unknown event type — still 200.
    console.log('[solo-wpp] Evento desconhecido (200 ignorado):', eventType)
    return sendResponse({ ignored: true, reason: 'unknown_event' })

  } catch (error) {
    const errorMessage = (error as Error).message
    console.error('[solo-wpp] Erro fatal (retornando 200):', errorMessage)
    // Never 5xx — whatsmiau retries on non-200.
    return new Response(JSON.stringify({ ignored: true, reason: 'internal_error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})

// ============================================================================
// CONNECTION_UPDATE handler
// ============================================================================

async function handleConnectionUpdate(
  supabase: any,
  instance: {
    id: string
    equipe_id: string
    status: string
    phone: string | null
    billing_active: boolean
  },
  data: ConnectionUpdateData,
): Promise<Response> {
  const { state, wuid } = data

  // Map Evolution states to our internal status values
  let newStatus: string
  let isFirstConnection = false

  switch (state) {
    case 'open':
      newStatus = 'connected'
      isFirstConnection = instance.status !== 'connected'
      break
    case 'close':
      newStatus = 'disconnected'
      break
    case 'connecting':
      newStatus = 'awaiting_qr'
      break
    case 'qr-code': // live validation 2026-07-04: estado real emitido pela VPS ao aguardar pareamento
      newStatus = 'awaiting_qr'
      break
    default:
      console.log('[solo-wpp] Estado de conexao desconhecido, ignorando:', state)
      return new Response(JSON.stringify({ ignored: true, reason: 'unknown_connection_state' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    last_health_at: new Date().toISOString(),
  }

  // Extract phone from wuid on first connection
  if (wuid && newStatus === 'connected') {
    const phone = extractPhoneFromJid(wuid)
    if (phone) updates.phone = phone
  }

  // Set connected_at on first transition to connected
  if (isFirstConnection && newStatus === 'connected') {
    updates.connected_at = new Date().toISOString()
    updates.billing_active = true
  }

  // If we're connecting from disconnected back to connected, also set billing_active
  if (newStatus === 'connected' && instance.status === 'disconnected' && !instance.billing_active) {
    updates.billing_active = true
  }

  const { error: updateError } = await supabase
    .from('wpp_instances')
    .update(updates)
    .eq('id', instance.id)

  if (updateError) {
    console.error('[solo-wpp] Erro atualizando instancia:', updateError)
  } else {
    console.log('[solo-wpp] Instancia atualizada:', { instanceId: instance.id, newStatus, isFirstConnection })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
}

// ============================================================================
// MESSAGES_UPSERT handler
// ============================================================================

async function handleMessagesUpsert(
  supabase: any,
  instance: {
    id: string
    equipe_id: string
    status: string
    phone: string | null
    ingest_inbound: boolean
  },
  data: MessagesUpsertData,
): Promise<Response> {

  // ── 4a. Check ingest_inbound flag ──
  if (!instance.ingest_inbound) {
    console.log('[solo-wpp] ingest_inbound=false — ignorando (numero tambem no GPT Maker)')
    return new Response(JSON.stringify({ ignored: true, reason: 'ingest_inbound_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  const { key, pushName, message, messageType, messageTimestamp } = data
  if (!key || !key.remoteJid) {
    console.log('[solo-wpp] MESSAGES_UPSERT sem key.remoteJid — ignorando')
    return new Response(JSON.stringify({ ignored: true, reason: 'missing_remote_jid' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // ── 4b. Skip group/broadcast JIDs ──
  if (isGroupOrBroadcast(key.remoteJid)) {
    console.log('[solo-wpp] Ignorando grupo/broadcast:', key.remoteJid.split('@')[1])
    return new Response(JSON.stringify({ ignored: true, reason: 'group_or_broadcast' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // ── 4c. Extract message fields ──
  const phone = extractPhoneFromJid(key.remoteJid)
  const phoneNorm = normalizePhone(phone)
  const senderType = key.fromMe ? 'agent' : 'customer'
  const providerMessageId = key.id
  const messageContent = extractTextFromMessage(message as Record<string, unknown>)
  const mediaType = detectMediaType(messageType)
  const hasMedia = !!mediaType

  // For inbound media without GCS, use placeholder content
  const displayContent = messageContent || (hasMedia ? '[Midia recebida]' : '')
  const messageDate = messageTimestamp
    ? new Date(messageTimestamp * 1000).toISOString()
    : new Date().toISOString()

  console.log('[solo-wpp] Mensagem processada:', {
    phone: phone?.substring(0, 6),
    phoneNorm: phoneNorm?.substring(0, 8),
    senderType,
    hasMedia,
    mediaType,
    contentLength: displayContent.length,
    messageId: providerMessageId?.substring(0, 8),
  })

  // ── 4d. Lead lookup/create with 23505 race handling ──
  const equipeId = instance.equipe_id

  // First check if the equipe has CRM agent enabled
  const { data: equipe } = await supabase
    .from('equipes')
    .select('is_crm_agent_enabled')
    .eq('id', equipeId)
    .maybeSingle()

  const isAgentEnabled = equipe?.is_crm_agent_enabled || false

  let lead: { id: string; phone: string | null } | null = null
  let leadIsNew = false

  if (phoneNorm) {
    const { data: leadByPhone } = await supabase
      .from('leads')
      .select('id, phone')
      .eq('phone_normalized', phoneNorm)
      .eq('equipe_id', equipeId)
      .is('deleted_at', null)
      .maybeSingle()

    if (leadByPhone) {
      lead = leadByPhone
      console.log('[solo-wpp] Lead encontrado por telefone:', (lead as NonNullable<typeof lead>).id)
    }
  }

  if (!lead) {
    console.log('[solo-wpp] Lead nao encontrado, criando novo...')
    const senderName = pushName || (phone ? `Lead ${phone}` : 'Novo Visitante')

    const baseLead = {
      phone: phone || null,
      phone_normalized: phoneNorm,
      name: senderName,
      equipe_id: equipeId,
      lead_type: 'lead',
      source: 'WhatsApp',
      origem: 'WhatsApp',
      channel: 'whatsapp',
      last_message_at: messageDate,
    }

    const insertLead = (creationSource: string) =>
      supabase
        .from('leads')
        .insert({ ...baseLead, creation_source: creationSource })
        .select('id, phone')
        .single()

    let { data: newLead, error: createError } = await insertLead('solo_api')

    // 23514: bancos sem a migration 20260807020000 mantêm o CHECK antigo
    // (manual|ai_agent|webhook|import). Degradar para 'webhook' preserva a
    // mensagem — a proveniência real vive em conversations.solo_instance_id
    // e messages.provider='solo'.
    if (createError && (createError as { code?: string }).code === '23514') {
      console.warn(
        '[solo-wpp] CHECK leads_creation_source_check rejeitou solo_api — ' +
        'aplicar migration 20260807020000. Degradando para creation_source=webhook.'
      )
      ;({ data: newLead, error: createError } = await insertLead('webhook'))
    }

    if (createError) {
      const pgCode = (createError as { code?: string }).code
      if (pgCode === '23505' && phoneNorm) {
        console.log('[solo-wpp] Race 23505 detectada, re-buscando lead vencedor...')
        const { data: winner } = await supabase
          .from('leads')
          .select('id, phone')
          .eq('phone_normalized', phoneNorm)
          .eq('equipe_id', equipeId)
          .is('deleted_at', null)
          .maybeSingle()
        if (!winner) {
          console.error('[solo-wpp] 23505 mas sem winner — abortando.', createError)
          throw createError
        }
        lead = winner
      } else {
        console.error('[solo-wpp] Erro ao criar lead:', createError)
        throw createError
      }
    } else {
      lead = newLead
      leadIsNew = true
      console.log('[solo-wpp] Novo lead criado:', (lead as NonNullable<typeof lead>).id)
    }
  }

  if (!lead) throw new Error("Falha inesperada: Lead nulo apos processamento")

  // Update existing lead's last_message_at
  if (!leadIsNew && lead) {
    await supabase
      .from('leads')
      .update({ last_message_at: messageDate })
      .eq('id', lead.id)
  }

  // ── 4e. Conversation upsert with solo_instance_id ──
  let conversationId: string | null = null

  {
    // Attempt 1: lead_id + channel = whatsapp
    let existingConv: { id: string; status: string } | null = null

    const { data: byChannel } = await supabase
      .from('conversations')
      .select('id, status')
      .eq('lead_id', lead.id)
      .eq('channel', 'whatsapp')
      .neq('status', 'deleted')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (byChannel) {
      existingConv = byChannel
    }

    // Attempt 2: any non-deleted conversation for this lead
    if (!existingConv) {
      const { data: byLead } = await supabase
        .from('conversations')
        .select('id, status')
        .eq('lead_id', lead.id)
        .neq('status', 'deleted')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (byLead) {
        existingConv = byLead
      }
    }

    if (existingConv) {
      conversationId = existingConv.id
      const convUpdates: Record<string, unknown> = {
        last_message_at: messageDate,
        solo_instance_id: instance.id,
      }
      if (existingConv.status === 'archived') {
        convUpdates.status = 'active'
        convUpdates.archived_at = null
        console.log('[solo-wpp] Auto-reabrindo conversa arquivada:', conversationId)
      }
      await supabase
        .from('conversations')
        .update(convUpdates)
        .eq('id', conversationId)
    } else {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          lead_id: lead.id,
          equipe_id: equipeId,
          channel: 'whatsapp',
          status: 'active',
          atendido_por_agente: false,
          solo_instance_id: instance.id,
          last_message_at: messageDate,
          unread_count: 0,
        })
        .select('id')
        .single()

      if (convError) {
        console.error('[solo-wpp] Erro ao criar conversa:', convError)
        throw convError
      }
      conversationId = newConv.id
      console.log('[solo-wpp] Nova conversa criada:', conversationId)
    }
  }

  // ── 4f. Opportunity + AI (customer messages only) ──
  if (senderType === 'customer') {
    // resolveActiveOpportunity in background
    EdgeRuntime.waitUntil(
      (async () => {
        try {
          const opp = await resolveActiveOpportunity(supabase, {
            equipe_id: equipeId,
            lead_id: lead.id,
            createIfMissing: true,
          })
          if (opp?.created) {
            console.log('[solo-wpp] Opportunity criada para lead:', lead.id, '->', opp.opportunity_id)
          }
        } catch (oppErr) {
          console.error('[solo-wpp] Falha ao garantir opportunity:', oppErr)
        }
      })()
    )
  }

  // ── 4g. Message dedup ──
  let skipInsert = false

  // Dedup 1: by provider_message_id (exact match, any sender type)
  if (providerMessageId) {
    const { data: existingByProviderId } = await supabase
      .from('messages')
      .select('id')
      .eq('provider_message_id', providerMessageId)
      .eq('provider', 'solo')
      .limit(1)
      .maybeSingle()

    if (existingByProviderId) {
      console.log('[solo-wpp] Dedup por provider_message_id:', providerMessageId.substring(0, 12))
      skipInsert = true
    }
  }

  // Dedup 2: time-window near-duplicate / outbound echo detection
  // Mirror gpt-maker-webhook dedup semantics (lines 500-543): media-type matching
  // is ONLY used in the outbound echo fingerprint (existing.sender_id !== null
  // + same media_type + <=30s). Bare mediaTypeMatch is removed because it drops
  // real messages (e.g. two different photos within 60s).
  if (!skipInsert) {
    const DEDUP_WINDOW_MS = senderType === 'agent' ? 300_000 : 60_000
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const incomingContent = displayContent.trim().toLowerCase()

    let recentQuery = supabase
      .from('messages')
      .select('id, content, created_at, media_type, sender_type, sender_id, provider')
      .eq('lead_id', lead.id)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20)

    if (senderType === 'customer') {
      recentQuery = recentQuery.eq('sender_type', 'customer')
    }

    const { data: recentMsgs } = await recentQuery

    if (recentMsgs && recentMsgs.length > 0) {
      for (const existing of recentMsgs) {
        const existingContent = (existing.content || '').trim().toLowerCase()
        // PM fixup (merge gate): mídia sem caption vira placeholder '[Midia recebida]',
        // então duas fotos diferentes teriam conteúdo idêntico — nunca text-match
        // em placeholder (álbuns de fotos chegariam pela metade). Dedup de mídia
        // fica por provider_message_id (Dedup 1) + outboundMediaEcho.
        const isMediaPlaceholder = hasMedia && !messageContent
        const textMatch = !isMediaPlaceholder && (incomingContent
          ? existingContent === incomingContent
          : existingContent === '')

        // Outbound media echo fingerprint: agent sent media and an existing
        // outbound record (sender_id !== null) has same media_type within 30s.
        // URLs may differ between send+webhook (not re-hosted in solo), but
        // the signature — outbound, recent, same type — is sufficient.
        const existingAgeMs = Date.now() - new Date(existing.created_at || 0).getTime()
        const outboundMediaEcho =
          senderType === 'agent' &&
          !!mediaType &&
          existing.sender_type === 'agent' &&
          existing.sender_id !== null &&
          !!existing.media_type &&
          existing.media_type === mediaType &&
          existingAgeMs <= 30_000

        const crossProviderInboundMedia =
          senderType === 'customer' &&
          hasMedia &&
          !messageContent &&
          existing.sender_type === 'customer' &&
          existing.provider !== 'solo' &&
          !!existing.media_type &&
          existing.media_type === mediaType &&
          existingAgeMs <= 30_000

        if (textMatch || outboundMediaEcho || crossProviderInboundMedia) {
          console.log('[solo-wpp] Dedup hit:', existing.id, {
            textMatch,
            outboundMediaEcho,
            crossProviderInboundMedia,
          })
          skipInsert = true
          break
        }
      }
    }
  }

  // ── 4h. Insert message ──
  if (!skipInsert) {
    const { error: msgError } = await supabase.from('messages').insert({
      lead_id: lead.id,
      conversation_id: conversationId,
      content: displayContent,
      sender_type: senderType,
      media_type: mediaType,
      provider: 'solo',
      provider_message_id: providerMessageId,
      created_at: messageDate,
    })

    if (msgError) {
      console.error('[solo-wpp] Erro ao salvar mensagem:', msgError)
    } else {
      console.log('[solo-wpp] Mensagem salva:', { senderType, mediaType, convId: conversationId })
    }
  }

  // ── 4i. Increment unread (customer messages only, not dupes) ──
  if (senderType === 'customer' && !skipInsert) {
    if (conversationId) {
      const { error: convRpcError } = await supabase.rpc(
        'increment_conversation_unread_count',
        { conv_id: conversationId }
      )
      if (convRpcError) {
        console.error('[solo-wpp] Erro incrementando unread_count conversa:', convRpcError)
      }
    }

    const { error: rpcError } = await supabase.rpc('increment_unread_count', {
      row_id: lead.id
    })
    if (rpcError) {
      console.error('[solo-wpp] Erro incrementando unread_count lead:', rpcError)
    }
  }

  // ── 4j. Dispatch analyze-message in background (gated by is_crm_agent_enabled) ──
  if (senderType === 'customer' && !skipInsert) {
    if (!isAgentEnabled) {
      console.log('[solo-wpp] Agente CRM desativado — ignorando analise IA.')
    } else {
      const aiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-message`
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      EdgeRuntime.waitUntil(
        fetch(aiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            lead_id: lead.id,
            message_content: displayContent,
            conversation_history: ''
          })
        }).then(async res => {
          if (!res.ok) {
            const text = await res.text()
            console.error('[solo-wpp] Falha IA:', res.status, text)
          } else {
            console.log('[solo-wpp] IA disparada com sucesso')
          }
        }).catch(err => console.error('[solo-wpp] Erro fetch IA:', err))
      )
    }
  }

  return new Response(JSON.stringify({ success: true, lead_id: lead.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
}
