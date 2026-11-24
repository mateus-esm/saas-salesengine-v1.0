// ============================================================================
// Sprint 17 — Meta (Lead Ads + CAPI): a parte pura, testável sem rede.
//
// Assinaturas (webhook, signed_request, appsecret_proof), o diálogo OAuth do
// Login for Business (token system-user: response_type=code), a tradução dos
// erros do Meta em mensagem de tela e o backoff da fila. Nada aqui toca token
// em log: quem chama decide o que registra.
// Doc: docs/superpowers/specs/2026-11-24-sprint17-meta-integration-design.md
// ============================================================================

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
