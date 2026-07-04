// ============================================================================
// Sprint 7 T5 — Solo (Whatsmiau) outbound message sender.
//
// Encapsulates the three Whatsmiau send endpoints (text, media, audio) used by
// send-chat-message for Rota A (solo-native), Rota B fallback, and Rota C
// (outbound-initiated).
//
// The caller is responsible for phone normalization (digits-only).
// ============================================================================
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a clean file name from a media URL, mirroring the logic in
 * send-chat-message/index.ts:116-118.
 *
 * Handles URLs like:
 *   https://.../12345678_report.pdf?token=abc → "report.pdf"
 */
export function cleanName(mediaUrl: string): string {
  const rawFileName = mediaUrl.split('/').pop()?.split('?')[0] || 'documento'
  return decodeURIComponent(
    rawFileName.includes('_') ? rawFileName.split('_').slice(1).join('_') : rawFileName
  )
}

/**
 * Guess a MIME type from the media URL extension and the declared media type.
 * Falls back to a reasonable default when neither is available.
 */
function guessMimetype(mediaUrl: string | undefined, mediaType: string): string {
  if (!mediaUrl) {
    const defaultMimes: Record<string, string> = {
      image: 'image/png',
      video: 'video/mp4',
      document: 'application/pdf',
    }
    return defaultMimes[mediaType] || 'application/octet-stream'
  }

  // Try to infer from the file extension
  const ext = mediaUrl.split('.').pop()?.toLowerCase().split('?')[0] || ''
  const extMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
  }

  if (extMap[ext]) return extMap[ext]

  // Fall back by mediaType
  const typeMap: Record<string, string> = {
    image: 'image/png',
    video: 'video/mp4',
    document: 'application/pdf',
  }
  return typeMap[mediaType] || 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// sendViaSolo
// ---------------------------------------------------------------------------

export interface SendViaSoloArgs {
  supabase: SupabaseClient   // service-role client
  equipeId: string
  instanceName: string
  phone: string              // digits only (already normalized by caller)
  content?: string
  mediaUrl?: string
  mediaType?: string
}

export interface SendViaSoloResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

/**
 * Send a message via the Solo (Whatsmiau) API.
 *
 * Routes to the correct endpoint based on mediaType:
 *   - none / 'text'   → POST /v1/message/sendText/{instance}
 *   - 'image'|'video'|'document' → POST /v1/message/sendMedia/{instance}
 *   - 'audio'         → POST /v1/message/sendWhatsAppAudio/{instance}
 *
 * Timeout: 15 seconds.
 */
export async function sendViaSolo(args: SendViaSoloArgs): Promise<SendViaSoloResult> {
  const { supabase, equipeId, instanceName, phone, content, mediaUrl, mediaType } = args

  const baseUrl = Deno.env.get('WHATSMIAU_BASE_URL')
  const apiKey = Deno.env.get('WHATSMIAU_API_KEY')

  if (!baseUrl || !apiKey) {
    return { ok: false, error: 'Missing WHATSMIAU_BASE_URL or WHATSMIAU_API_KEY env vars' }
  }

  // ── Determine endpoint and build body ──

  let endpoint: string
  let body: Record<string, unknown>

  if (!mediaType || mediaType === 'text') {
    // Text message
    endpoint = `/v1/message/sendText/${instanceName}`
    body = { number: phone, text: content || '' }
  } else if (['image', 'video', 'document'].includes(mediaType)) {
    // Media message (image / video / document)
    endpoint = `/v1/message/sendMedia/${instanceName}`
    const fileName = cleanName(mediaUrl || '')
    const mimetype = guessMimetype(mediaUrl, mediaType)
    body = {
      number: phone,
      mediatype: mediaType,
      media: mediaUrl,
      caption: content || '',
      fileName,
      mimetype,
    }
  } else if (mediaType === 'audio') {
    // Audio voice note — never send text alongside audio (mirrors GPT Maker's
    // `delete body.message` rule).
    endpoint = `/v1/message/sendWhatsAppAudio/${instanceName}`
    body = {
      number: phone,
      audio: mediaUrl,
      encoding: true,
    }
    if (content) {
      console.log('[SoloSender] audio without text (content dropped)')
    }
  } else {
    return { ok: false, error: `Unknown mediaType: "${mediaType}"` }
  }

  // ── Execute ──

  const url = `${baseUrl.replace(/\/+$/, '')}${endpoint}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, error: `Solo API returned ${response.status}: ${text.substring(0, 200)}` }
    }

    const data = await response.json()
    const providerMessageId = data?.key?.id

    if (!providerMessageId) {
      return { ok: false, error: 'Solo API response missing key.id' }
    }

    console.log('[SoloSender] sent successfully | instance:', instanceName, '| providerMessageId:', providerMessageId)

    return { ok: true, providerMessageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Solo API error: ${message}` }
  } finally {
    clearTimeout(timeout)
  }
}
