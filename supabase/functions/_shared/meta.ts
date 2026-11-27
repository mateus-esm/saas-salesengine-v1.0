// ============================================================================
// Sprint 17 — Meta (Lead Ads + CAPI): a parte pura, testável sem rede.
//
// Assinaturas (webhook, signed_request, appsecret_proof), o diálogo OAuth do
// Login for Business (token system-user: response_type=code), a tradução dos
// erros do Meta em mensagem de tela e o backoff da fila. Nada aqui toca token
// em log: quem chama decide o que registra.
// Doc: docs/superpowers/specs/2026-11-24-sprint17-meta-integration-design.md
// ============================================================================

import { normalizePhone } from "./phone.ts";

export const GRAPH_VERSION = "v27.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

/** Comparação em tempo constante (mesmo comprimento → percorre tudo). */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** O Meta exige `appsecret_proof` = HMAC-SHA256(token, app secret) nas chamadas server-side. */
export function appsecretProof(token: string, appSecret: string): Promise<string> {
  return hmacSha256Hex(appSecret, token);
}

/** `X-Hub-Signature-256: sha256=<hex>` sobre o corpo CRU (antes do JSON.parse). */
export async function verifySignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return constantTimeEqual(header.slice(7).toLowerCase(), expected);
}

/** Verificação do webhook (GET): devolve o `hub.challenge` ou null. */
export function verifyChallenge(params: URLSearchParams, verifyToken: string): string | null {
  if (!verifyToken || params.get("hub.mode") !== "subscribe") return null;
  const token = params.get("hub.verify_token") ?? "";
  if (!constantTimeEqual(token, verifyToken)) return null;
  return params.get("hub.challenge");
}

const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** `signed_request` da exclusão de dados / deauthorize: `<sig>.<payload>` em base64url. */
export async function parseSignedRequest(
  sr: string,
  appSecret: string,
): Promise<{ user_id: string; algorithm: string; issued_at?: number } | null> {
  try {
    const [sig, payload] = sr.split(".");
    if (!sig || !payload || !appSecret) return null;
    const expected = await hmacSha256Hex(appSecret, payload);
    const got = toHex(fromB64url(sig).buffer as ArrayBuffer);
    if (!constantTimeEqual(got, expected)) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (String(data?.algorithm).toUpperCase() !== "HMAC-SHA256" || data?.user_id == null) return null;
    return { ...data, user_id: String(data.user_id) };
  } catch {
    return null;
  }
}

export const META_CALLBACK_PATH = "/integracoes/meta/callback";

/**
 * Domínio de nicho aceito para receber a volta do OAuth: https em `*.soloventures.com.br`
 * (ou o raiz) e os domínios extras de `META_REDIRECT_ORIGINS` (lista por vírgula).
 * Devolve o hostname em minúsculas, ou null.
 */
export function allowedReturnHost(origin: unknown, extraOrigins = ""): string | null {
  if (typeof origin !== "string" || !origin) return null;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const extras = extraOrigins.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    .map((s) => {
      try {
        return new URL(s.includes("://") ? s : `https://${s}`).hostname;
      } catch {
        return "";
      }
    });
  return host === "soloventures.com.br" || host.endsWith(".soloventures.com.br") || extras.includes(host) ? host : null;
}

/**
 * O Meta sempre volta para um único endereço (`META_REDIRECT_URI`, o único cadastrado no app).
 * O state leva o domínio do nicho onde o admin clicou — `<nonce>.<host>` — e a página de volta
 * repassa o navegador para lá, onde está a sessão certa (a sessão do Supabase é por domínio).
 * O nonce (base64url) não tem ponto, então o 1º ponto separa os dois.
 */
export function buildOAuthState(nonce: string, host: string | null): string {
  return host ? `${nonce}.${host}` : nonce;
}

/** Diálogo OAuth por redirecionamento (Login for Business, token system-user). `config_id` substitui `scope`. */
export function oauthDialogUrl(o: { appId: string; configId: string; redirectUri: string; state: string }): string {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", o.appId);
  u.searchParams.set("config_id", o.configId);
  u.searchParams.set("redirect_uri", o.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("override_default_response_type", "true");
  u.searchParams.set("state", o.state);
  return u.toString();
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type MetaErrorCode = "token_invalid" | "permission_missing" | "rate_limited" | "leads_access" | "unknown";

/** Erro do Graph → mensagem de tela. `reconnect` = a tela mostra "Reconectar". */
export function metaErrorMessage(err: { code?: number; error_subcode?: number; message?: string; type?: string }): {
  code: MetaErrorCode;
  message: string;
  reconnect: boolean;
} {
  const code = Number(err?.code);
  const raw = String(err?.message ?? "");
  if (code === 190 || code === 102) {
    return { code: "token_invalid", reconnect: true, message: "A conexão com o Meta expirou ou foi revogada. Clique em Reconectar." };
  }
  if (/lead.*access|leads access manager|gerenciador de acesso a leads/i.test(raw)) {
    return {
      code: "leads_access",
      reconnect: false,
      message: "O Meta bloqueou o acesso aos leads desta página. No Business, abra o Gerenciador de acesso a leads e libere o app do Rev.",
    };
  }
  if (code === 200 || code === 10 || (code >= 200 && code <= 299)) {
    return { code: "permission_missing", reconnect: true, message: "Falta uma permissão no Meta. Reconecte e marque todas as páginas e permissões pedidas." };
  }
  if ([4, 17, 32, 613, 80005].includes(code) || (code >= 80000 && code <= 80014)) {
    return { code: "rate_limited", reconnect: false, message: "O Meta limitou as chamadas por agora. O Rev tenta de novo sozinho." };
  }
  return { code: "unknown", reconnect: false, message: raw ? `Erro do Meta: ${raw.slice(0, 200)}` : "Erro desconhecido do Meta." };
}

/** Atraso da próxima tentativa: 2^n minutos, no máximo 6 horas. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts) * 60_000, 6 * 3600_000);
}

// ============================================================================
// Fases 2–4 — webhook leadgen, lead do formulário, evento da CAPI.
// ============================================================================

export interface LeadgenChange {
  page_id: string;
  leadgen_id: string;
  form_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  created_time: number | null;
}

const idStr = (v: unknown): string | null => {
  if (typeof v === "string" && /^\d{1,40}$/.test(v.trim())) return v.trim();
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return BigInt(Math.trunc(v)).toString();
  return null;
};

/**
 * O `leadgen_id` tem 15–17 dígitos: acima de Number.MAX_SAFE_INTEGER o JSON.parse
 * arredonda. Com o corpo cru em mãos, os IDs numéricos viram texto antes do parse.
 */
export function parseLeadgenWebhook(body: unknown, raw?: string): LeadgenChange[] {
  let b = body;
  if (raw) {
    try {
      b = JSON.parse(raw.replace(/"(leadgen_id|page_id|form_id|ad_id|adgroup_id)"\s*:\s*(\d+)/g, '"$1":"$2"'));
    } catch {
      b = body;
    }
  }
  const o = b as { object?: unknown; entry?: unknown } | null;
  if (!o || o.object !== "page" || !Array.isArray(o.entry)) return [];
  const out: LeadgenChange[] = [];
  for (const e of o.entry as { id?: unknown; changes?: unknown }[]) {
    if (!e || !Array.isArray(e.changes)) continue;
    for (const c of e.changes as { field?: unknown; value?: Record<string, unknown> }[]) {
      if (c?.field !== "leadgen" || !c.value) continue;
      const v = c.value;
      const leadgen = idStr(v.leadgen_id);
      const page = idStr(v.page_id) ?? idStr(e.id);
      if (!leadgen || !page) continue;
      const ct = Number(v.created_time);
      out.push({
        page_id: page,
        leadgen_id: leadgen,
        form_id: idStr(v.form_id),
        ad_id: idStr(v.ad_id),
        adgroup_id: idStr(v.adgroup_id),
        created_time: Number.isFinite(ct) && ct > 0 ? ct : null,
      });
    }
  }
  return out;
}

export interface FormLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  observations: string | null;
  answers: Record<string, string>;
}

const NAME_KEYS = ["full_name", "name", "nome", "nome_completo"];
const EMAIL_KEYS = ["email", "work_email", "e-mail"];
const PHONE_KEYS = ["phone_number", "phone", "work_phone_number", "mobile_phone_number", "telefone", "whatsapp", "celular"];
const SKIP_KEYS = new Set([...NAME_KEYS, ...EMAIL_KEYS, ...PHONE_KEYS, "first_name", "last_name"]);

const questionLabel = (k: string) => {
  const s = k.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** `field_data` do Meta → nome/e-mail/telefone pelos nomes padrão; o resto vira observação. */
export function fieldDataToLead(fieldData: unknown): FormLead {
  const vals = new Map<string, string>();
  const order: string[] = [];
  for (const f of Array.isArray(fieldData) ? fieldData as { name?: unknown; values?: unknown }[] : []) {
    if (!f || typeof f.name !== "string") continue;
    const v = (Array.isArray(f.values) ? f.values : []).map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
    if (!v) continue;
    const k = f.name.trim();
    if (!vals.has(k)) order.push(k);
    vals.set(k, v);
  }
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = vals.get(k);
      if (v) return v;
    }
    return null;
  };
  const first = vals.get("first_name");
  const last = vals.get("last_name");
  const name = pick(NAME_KEYS) ?? ([first, last].filter(Boolean).join(" ") || null);
  const answers: Record<string, string> = {};
  for (const k of order) if (!SKIP_KEYS.has(k.toLowerCase())) answers[k] = vals.get(k)!;
  const obs = Object.entries(answers).map(([k, v]) => `${questionLabel(k)}: ${v}`).join("\n");
  return {
    name,
    email: normalizeEmail(pick(EMAIL_KEYS)),
    phone: pick(PHONE_KEYS),
    observations: obs || null,
    answers,
  };
}

/** O lead da Graph API → as chaves que `_crm_touch_fields` lê (+ `leadgen_id`). */
export function metaTouchPayload(lead: Record<string, unknown>, formName: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    if (s) out[k] = s;
  };
  put("leadgen_id", lead.id);
  put("ad_id", lead.ad_id);
  put("ad_name", lead.ad_name);
  put("adset_id", lead.adset_id);
  put("adset_name", lead.adset_name);
  put("campaign_id", lead.campaign_id);
  put("campaign_name", lead.campaign_name);
  put("form_id", lead.form_id);
  put("form_name", formName);
  put("meta_platform", lead.platform);
  out.utm_source = "facebook";
  out.utm_medium = lead.is_organic === true ? "organic_social" : "paid_social";
  return out;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/** Só dígitos, com DDI, sem zeros à esquerda (regra de hash do Meta). */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
}

export function buildFbc(fbclid: string | null | undefined, clickMs: number): string | null {
  const f = String(fbclid ?? "").trim();
  return f ? `fb.1.${Math.trunc(clickMs)}.${f}` : null;
}

/** Mesma etapa do mesmo negócio = mesmo `event_id` → o Meta deduplica. */
export function capiEventId(equipeId: string, opportunityId: string, stageId: string, eventName: string): Promise<string> {
  return sha256Hex(`${equipeId}:${opportunityId}:${stageId}:${eventName}`);
}

export type CapiSkipReason = "no_match_key" | "too_old" | "capi_off" | "whatsapp_requires_waba";
export type CapiMatchKey = "lead_id" | "fbc" | "hashed_pii";

export interface CapiEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "system_generated";
  user_data: { lead_id?: string; fbc?: string; em?: string[]; ph?: string[] };
  custom_data: { event_source: "crm"; lead_event_source: string };
}

export interface CapiInput {
  eventName: string;
  eventId: string;
  eventTimeMs: number;
  leadCreatedMs: number | null;
  nowMs: number;
  leadEventSource: string;
  leadgenId?: string | null;
  fbclid?: string | null;
  touchAtMs?: number | null;
  ctwaClid?: string | null;
  email?: string | null;
  phone?: string | null;
}

const CAPI_MAX_AGE_MS = 7 * 86400_000;

/**
 * Evento "Conversion Leads" (CAPI para CRM). `lead_id` sempre texto, nunca Number.
 * O JSON enviado leva `lead_id` como string; o Meta aceita o inteiro em texto, e
 * Number() perderia os últimos dígitos.
 */
export async function buildCapiEvent(
  i: CapiInput,
): Promise<{ ok: true; match_key: CapiMatchKey; event: CapiEvent } | { ok: false; skip_reason: CapiSkipReason }> {
  if (i.nowMs - i.eventTimeMs > CAPI_MAX_AGE_MS) return { ok: false, skip_reason: "too_old" };
  if (i.leadCreatedMs != null && i.eventTimeMs < i.leadCreatedMs) return { ok: false, skip_reason: "too_old" };

  const user: CapiEvent["user_data"] = {};
  const em = normalizeEmail(i.email);
  const ph = normalizePhoneE164(i.phone);
  if (em) user.em = [await sha256Hex(em)];
  if (ph) user.ph = [await sha256Hex(ph)];

  let key: CapiMatchKey | null = null;
  const leadgen = String(i.leadgenId ?? "").trim();
  if (/^\d{1,40}$/.test(leadgen)) {
    user.lead_id = leadgen;
    key = "lead_id";
  } else if (i.fbclid) {
    const fbc = buildFbc(i.fbclid, i.touchAtMs ?? i.eventTimeMs);
    if (fbc) {
      user.fbc = fbc;
      key = "fbc";
    }
  }
  if (!key && i.ctwaClid) return { ok: false, skip_reason: "whatsapp_requires_waba" };
  if (!key && (user.em || user.ph)) key = "hashed_pii";
  if (!key) return { ok: false, skip_reason: "no_match_key" };

  return {
    ok: true,
    match_key: key,
    event: {
      event_name: i.eventName,
      event_time: Math.floor(i.eventTimeMs / 1000),
      event_id: i.eventId,
      action_source: "system_generated",
      user_data: user,
      custom_data: { event_source: "crm", lead_event_source: i.leadEventSource || "Rev" },
    },
  };
}
