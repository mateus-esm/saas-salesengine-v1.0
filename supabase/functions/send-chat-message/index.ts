import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendViaSolo } from '../_shared/solo-sender.ts'
import { openManualGptConversation } from '../_shared/manual-conversation.ts'
import { isTechnicalPhone, normalizePhone as normalizeProviderPhone } from '../_shared/phone.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class HttpError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type ProfileContext = {
  id: string
  user_id: string
  equipe_id: string
}

type DeliveryMessage = Record<string, any>

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function bearerFrom(req: Request): string {
  const authHeader = req.headers.get('Authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new HttpError('Unauthorized', 401)
  return match[1].trim()
}

async function getCallerProfile(req: Request): Promise<ProfileContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !anonKey) throw new Error('Supabase auth env vars not configured')

  const authHeader = req.headers.get('Authorization') || ''
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) throw new HttpError('Unauthorized', 401)

  const { data: profile, error: profileError } = await authClient
    .from('profiles')
    .select('id, user_id, equipe_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError || !profile?.equipe_id) {
    throw new HttpError('Profile not found', 403)
  }

  return profile as ProfileContext
}

async function loadAuthorizedContext(
  supabase: SupabaseClient,
  caller: ProfileContext,
  body: Record<string, any>,
) {
  let resolvedConversationId: string | null = body.conversation_id || null
  let resolvedLeadId: string | null = body.lead_id || null
  let resolvedChatId: string | null = body.chat_id || null
  let resolvedSoloInstanceId: string | null = null

  let conversation: Record<string, any> | null = null

  if (resolvedConversationId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, lead_id, gpt_maker_chat_id, solo_instance_id, status')
      .eq('id', resolvedConversationId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new HttpError('Conversation not found', 404)
    conversation = data
  } else if (resolvedLeadId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, lead_id, gpt_maker_chat_id, solo_instance_id, status')
      .eq('lead_id', resolvedLeadId)
      .neq('status', 'deleted')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    conversation = data ?? null
  } else if (resolvedChatId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, lead_id, gpt_maker_chat_id, solo_instance_id, status')
      .eq('gpt_maker_chat_id', resolvedChatId)
      .neq('status', 'deleted')
      .maybeSingle()
    if (error) throw error
    conversation = data ?? null
  }

  if (conversation) {
    if (conversation.status === 'deleted') {
      throw new HttpError('Conversation not found', 404)
    }
    if (resolvedLeadId && resolvedLeadId !== conversation.lead_id) {
      throw new HttpError('Conversation does not match lead', 400)
    }
    if (
      resolvedChatId &&
      conversation.gpt_maker_chat_id &&
      resolvedChatId !== conversation.gpt_maker_chat_id
    ) {
      throw new HttpError('Conversation does not match chat', 400)
    }
    resolvedConversationId = conversation.id
    resolvedLeadId = conversation.lead_id
    resolvedChatId = conversation.gpt_maker_chat_id || null
    resolvedSoloInstanceId = conversation.solo_instance_id || null
  } else if (resolvedLeadId) {
    resolvedChatId = null
  }

  if (!resolvedLeadId) {
    throw new HttpError('lead_id or conversation_id is required', 400)
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, phone, equipe_id')
    .eq('id', resolvedLeadId)
    .maybeSingle()
  if (leadError) throw leadError
  if (!lead) throw new HttpError('Lead not found', 404)
  if (lead.equipe_id !== caller.equipe_id) {
    throw new HttpError('Forbidden', 403)
  }

  // Sprint 8.1 B3 — read-only means outbound stops. Reads stay open so the
  // customer can still see their CRM and pay the invoice; what they cannot do is
  // keep sending on an account they are not paying for. 402 (not 403) so the UI
  // can tell "you owe us" apart from "you lack permission".
  const { data: suspended } = await supabase.rpc('tenant_is_suspended', {
    p_equipe_id: caller.equipe_id,
  })
  if (suspended === true) {
    throw new HttpError(
      'contract_suspended: sua conta está em modo somente leitura. Pague a fatura em aberto para voltar a enviar mensagens.',
      402,
    )
  }

  return {
    resolvedConversationId,
    resolvedLeadId,
    resolvedChatId,
    resolvedSoloInstanceId,
    leadPhone: lead.phone as string | null,
    equipeId: lead.equipe_id as string,
  }
}

function normalizePhone(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') || ''
  return digits.length >= 8 ? digits : null
}

async function getPinnedInstance(
  supabase: SupabaseClient,
  equipeId: string,
  instanceId: string,
): Promise<{ id: string; instance_name: string; status: string } | null> {
  const { data, error } = await supabase
    .from('wpp_instances')
    .select('id, instance_name, status')
    .eq('id', instanceId)
    .eq('equipe_id', equipeId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

async function getConnectedFallbackInstance(
  supabase: SupabaseClient,
  equipeId: string,
): Promise<{ id: string; instance_name: string } | null> {
  const { data, error } = await supabase
    .from('wpp_instances')
    .select('id, instance_name')
    .eq('equipe_id', equipeId)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

type DeliveryProfile = {
  provider: 'gptmaker' | 'solo'
  channel_id: string | null
  solo_instance_id: string | null
}

async function getDeliveryProfile(
  supabase: SupabaseClient,
  equipeId: string,
): Promise<DeliveryProfile> {
  const { data, error } = await supabase
    .from('conversation_opener_settings')
    .select('provider, channel_id, solo_instance_id')
    .eq('equipe_id', equipeId)
    .maybeSingle()
  if (error) throw error
  return {
    provider: data?.provider === 'solo' ? 'solo' : 'gptmaker',
    channel_id: data?.channel_id ?? null,
    solo_instance_id: data?.solo_instance_id ?? null,
  }
}

async function resolveManualSoloInstance(
  supabase: SupabaseClient,
  equipeId: string,
  configuredId: string | null,
): Promise<
  | { instance: { id: string; instance_name: string } }
  | { reason: 'solo_instance_not_found' | 'solo_instance_not_connected' | 'solo_instance_ambiguous' }
> {
  if (configuredId) {
    const pinned = await getPinnedInstance(supabase, equipeId, configuredId)
    if (!pinned) return { reason: 'solo_instance_not_found' }
    if (pinned.status !== 'connected') return { reason: 'solo_instance_not_connected' }
    return { instance: { id: pinned.id, instance_name: pinned.instance_name } }
  }

  const { data, error } = await supabase
    .from('wpp_instances')
    .select('id, instance_name')
    .eq('equipe_id', equipeId)
    .eq('status', 'connected')
    .limit(2)
  if (error) throw error
  if (!data?.length) return { reason: 'solo_instance_not_connected' }
  if (data.length > 1) return { reason: 'solo_instance_ambiguous' }
  return { instance: data[0] }
}

async function recordManualOpenFailure(
  supabase: SupabaseClient,
  eventId: string,
  reason: string,
  detail?: string,
  providerStatus?: number | null,
  providerBody?: unknown,
) {
  await supabase.from('conversation_open_events').update({
    status: 'failed',
    error_code: reason,
    error_message: (detail || reason).slice(0, 2000),
    provider_status: providerStatus ?? null,
    provider_response: providerBody ?? null,
  }).eq('id', eventId)
}

async function persistManualGptOpening(
  supabase: SupabaseClient,
  input: {
    equipeId: string
    leadId: string
    conversationId: string | null
    messageId: string
    eventId: string
    channelId: string
    channelType: string
    providerChatId: string | null
    providerStatus: number | null
    providerBody: unknown
  },
): Promise<string | null> {
  const now = new Date().toISOString()
  let conversationId = input.conversationId
  const patch: Record<string, unknown> = {
    opened_at: now,
    opened_via: 'start_conversation',
    provider_channel_id: input.channelId,
    last_message_at: now,
  }
  if (input.providerChatId) patch.gpt_maker_chat_id = input.providerChatId

  if (conversationId) {
    await supabase.from('conversations').update(patch).eq('id', conversationId)
  } else {
    const { data, error } = await supabase.from('conversations').insert({
      lead_id: input.leadId,
      equipe_id: input.equipeId,
      channel: 'whatsapp',
      status: 'active',
      atendido_por_agente: false,
      unread_count: 0,
      ...patch,
    }).select('id').single()
    if (error) throw error
    conversationId = data.id
  }

  await supabase.from('messages').update({
    conversation_id: conversationId,
    provider: 'gptmaker',
  }).eq('id', input.messageId)
  await supabase.from('conversation_open_events').update({
    status: 'opened',
    conversation_id: conversationId,
    channel_id: input.channelId,
    channel_type: input.channelType,
    provider_chat_id: input.providerChatId,
    provider_status: input.providerStatus,
    provider_response: input.providerBody ?? null,
    opened_at: now,
    error_code: null,
    error_message: null,
  }).eq('id', input.eventId)
  await supabase.from('lead_activities').insert({
    lead_id: input.leadId,
    tipo: 'conversation_opened',
    descricao: 'Conversa de WhatsApp aberta manualmente pelo Rev',
    metadata: {
      event_id: input.eventId,
      trigger_source: 'manual',
      channel_id: input.channelId,
      channel_type: input.channelType,
      provider_chat_id: input.providerChatId,
      conversation_id: conversationId,
      message_id: input.messageId,
    },
  })
  return conversationId
}

function markUndelivered(msg: DeliveryMessage, reason: string) {
  return { ...msg, delivered: false, reason }
}

async function updateMessageProvider(
  supabase: SupabaseClient,
  msg: DeliveryMessage,
  patch: Record<string, unknown>,
) {
  await supabase.from('messages').update(patch).eq('id', msg.id)
  Object.assign(msg, patch)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    bearerFrom(req)
    const caller = await getCallerProfile(req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const body = await req.json()
    const { content, action, media_url, media_type } = body
    const token = Deno.env.get('GPT_MAKER_TOKEN')

    const context = await loadAuthorizedContext(supabase, caller, body)
    const {
      resolvedConversationId,
      resolvedLeadId,
      resolvedChatId,
      resolvedSoloInstanceId,
      leadPhone,
      equipeId,
    } = context

    if (action === 'take_control' || action === 'stop_control') {
      if (!resolvedChatId) throw new HttpError('chat_id is required', 400)
      const endpoint = action === 'take_control' ? 'start-human' : 'stop-human'
      const response = await fetch(`https://api.gptmaker.ai/v2/chat/${resolvedChatId}/${endpoint}`, {
        method: 'PUT',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      })

      return jsonResponse({ success: response.ok })
    }

    const { data: msg, error: dbError } = await supabase
      .from('messages')
      .insert({
        lead_id: resolvedLeadId,
        conversation_id: resolvedConversationId,
        content,
        sender_type: 'agent',
        sender_id: caller.id,
        media_url: media_url || null,
        media_type: media_type || null,
      })
      .select()
      .single()

    if (dbError) throw dbError

    if (resolvedConversationId) {
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', resolvedConversationId)
    }

    const soloPhone = normalizePhone(leadPhone)

    if (resolvedSoloInstanceId) {
      const pinnedInstance = await getPinnedInstance(supabase, equipeId, resolvedSoloInstanceId)
      if (!pinnedInstance || pinnedInstance.status !== 'connected') {
        console.log('[SendMsg] route: solo | delivered=false | reason=pinned_solo_unavailable')
        return jsonResponse(markUndelivered(msg, 'pinned_solo_unavailable'))
      }
      if (!soloPhone) {
        console.log('[SendMsg] route: solo | delivered=false | reason=missing_phone')
        return jsonResponse(markUndelivered(msg, 'missing_phone'))
      }

      console.log('[SendMsg] route: solo')
      const soloResult = await sendViaSolo({
        supabase,
        equipeId,
        instanceName: pinnedInstance.instance_name,
        phone: soloPhone,
        content,
        mediaUrl: media_url,
        mediaType: media_type,
      })

      if (!soloResult.ok) {
        console.log('[SendMsg] route: solo | delivered=false | reason=solo_send_failed')
        return jsonResponse(markUndelivered(msg, 'solo_send_failed'))
      }

      await updateMessageProvider(supabase, msg, {
        provider: 'solo',
        provider_message_id: soloResult.providerMessageId,
      })
      return jsonResponse({ ...msg, delivered: true })
    }

    const connectedInstance = await getConnectedFallbackInstance(supabase, equipeId)

    if (resolvedChatId) {
      console.log('[SendMsg] route: gptmaker')

      try {
        await fetch(`https://api.gptmaker.ai/v2/chat/${resolvedChatId}/start-human`, {
          method: 'PUT',
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        })
      } catch (err) {
        console.error('[SendMsg] failed to start human mode:', err)
      }

      const gptBody: Record<string, any> = {}
      if (content) gptBody.message = content

      if (media_url) {
        const rawFileName = media_url.split('/').pop()?.split('?')[0] || 'documento'
        const cleanName = decodeURIComponent(rawFileName.includes('_') ? rawFileName.split('_').slice(1).join('_') : rawFileName)

        if (media_type === 'image') {
          gptBody.image = media_url
          gptBody.fileName = cleanName
        } else if (media_type === 'audio') {
          gptBody.audio = media_url
          delete gptBody.message
        } else if (media_type === 'video') {
          gptBody.video = media_url
          gptBody.fileName = cleanName
        } else {
          gptBody.document = media_url
          gptBody.fileName = cleanName
        }
      }

      const gptResponse = await fetch(`https://api.gptmaker.ai/v2/chat/${resolvedChatId}/send-message`, {
        method: 'POST',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(gptBody),
      })

      const gptRawText = await gptResponse.text()
      console.log(`[SendMsg] GPT Maker status: ${gptResponse.status}`)

      if (!gptResponse.ok) {
        if (connectedInstance && soloPhone) {
          console.log('[SendMsg] route: fallback-solo')
          const soloResult = await sendViaSolo({
            supabase,
            equipeId,
            instanceName: connectedInstance.instance_name,
            phone: soloPhone,
            content,
            mediaUrl: media_url,
            mediaType: media_type,
          })

          if (soloResult.ok) {
            await updateMessageProvider(supabase, msg, {
              provider: 'solo',
              provider_message_id: soloResult.providerMessageId,
            })
            return jsonResponse({ ...msg, delivered: true })
          }

          console.log('[SendMsg] route: fallback-solo | delivered=false | reason=fallback_solo_failed')
          return jsonResponse(markUndelivered(msg, 'fallback_solo_failed'))
        }

        const reason = soloPhone ? 'gpt_failed_no_solo' : 'gpt_failed_missing_phone'
        console.log(`[SendMsg] route: gptmaker | delivered=false | reason=${reason}`)
        return jsonResponse(markUndelivered(msg, reason))
      }

      try {
        const respData = JSON.parse(gptRawText)
        if (respData?.messageId) {
          await updateMessageProvider(supabase, msg, { gpt_message_id: respData.messageId })
        }
      } catch {
        console.warn('[SendMsg] GPT Maker response did not include parseable JSON')
      }

      return jsonResponse({ ...msg, delivered: true })
    }

    // SE-REV-002 / D7 — sem chat, a configuração do tenant decide a linha.
    // O ramo com chat acima permanece exatamente como antes (start-human +
    // send-message, inclusive o fallback legado). Para um clique humano cada
    // message_id vira uma chave de evento própria: há rastro, mas um segundo
    // clique deliberado nunca é bloqueado pela abertura anterior.
    const deliveryProfile = await getDeliveryProfile(supabase, equipeId)

    if (deliveryProfile.provider === 'gptmaker') {
      if (media_url || !String(content ?? '').trim()) {
        return jsonResponse(markUndelivered(msg, 'gpt_start_requires_text'))
      }
      if (isTechnicalPhone(leadPhone)) {
        return jsonResponse(markUndelivered(msg, 'technical_phone'))
      }
      const gptPhone = normalizeProviderPhone(leadPhone)
      if (!gptPhone) return jsonResponse(markUndelivered(msg, 'missing_phone'))

      const { data: event, error: eventError } = await supabase
        .from('conversation_open_events')
        .insert({
          equipe_id: equipeId,
          lead_id: resolvedLeadId,
          conversation_id: resolvedConversationId,
          event_key: `manual-message:${msg.id}`,
          trigger_source: 'manual',
          phone: gptPhone,
          message: content,
          status: 'pending',
        })
        .select('id')
        .single()
      if (eventError) throw eventError

      const token = Deno.env.get('GPT_MAKER_TOKEN') ?? ''
      if (!token) {
        await recordManualOpenFailure(supabase, event.id, 'engine_token_missing')
        return jsonResponse(markUndelivered(msg, 'engine_token_missing'))
      }
      const { data: team, error: teamError } = await supabase
        .from('equipes')
        .select('workspace_id, gpt_maker_agent_id')
        .eq('id', equipeId)
        .maybeSingle()
      if (teamError) throw teamError
      const workspaceId = String(team?.workspace_id ?? '').trim()
      const agentId = String(team?.gpt_maker_agent_id ?? '').trim()
      if (!workspaceId || !agentId) {
        const reason = workspaceId ? 'agent_not_configured' : 'workspace_not_configured'
        await recordManualOpenFailure(supabase, event.id, reason)
        return jsonResponse(markUndelivered(msg, reason))
      }

      const opened = await openManualGptConversation({
        token,
        workspaceId,
        agentId,
        preferredChannelId: deliveryProfile.channel_id,
        phone: gptPhone,
        message: String(content),
      })
      if (!opened.ok || !opened.channelId) {
        const reason = opened.errorCode ?? 'provider_rejected'
        await recordManualOpenFailure(
          supabase,
          event.id,
          reason,
          opened.detail,
          opened.providerStatus,
          opened.providerBody,
        )
        return jsonResponse(markUndelivered(msg, reason))
      }

      await persistManualGptOpening(supabase, {
        equipeId,
        leadId: resolvedLeadId,
        conversationId: resolvedConversationId,
        messageId: msg.id,
        eventId: event.id,
        channelId: opened.channelId,
        channelType: opened.channelType ?? 'WHATSAPP',
        providerChatId: opened.providerChatId ?? null,
        providerStatus: opened.providerStatus ?? null,
        providerBody: opened.providerBody,
      })
      Object.assign(msg, { provider: 'gptmaker' })
      return jsonResponse({ ...msg, delivered: true })
    }

    const soloLine = await resolveManualSoloInstance(
      supabase,
      equipeId,
      deliveryProfile.solo_instance_id,
    )
    if ('reason' in soloLine) {
      return jsonResponse(markUndelivered(msg, soloLine.reason))
    }
    if (!soloPhone) return jsonResponse(markUndelivered(msg, 'missing_phone'))
    const manualSoloResult = await sendViaSolo({
      supabase,
      equipeId,
      instanceName: soloLine.instance.instance_name,
      phone: soloPhone,
      content,
      mediaUrl: media_url,
      mediaType: media_type,
    })
    if (!manualSoloResult.ok) {
      return jsonResponse(markUndelivered(msg, 'outbound_solo_failed'))
    }
    if (resolvedConversationId) {
      await supabase.from('conversations').update({
        solo_instance_id: soloLine.instance.id,
      }).eq('id', resolvedConversationId)
    }
    await updateMessageProvider(supabase, msg, {
      provider: 'solo',
      provider_message_id: manualSoloResult.providerMessageId,
    })
    return jsonResponse({ ...msg, delivered: true })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      status,
    )
  }
})
