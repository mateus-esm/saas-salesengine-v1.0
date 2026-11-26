// ============================================================================
// Sprint 17 · Fase 2 — webhook público do Meta (um só para todas as equipes).
//
//   GET   verificação: hub.mode=subscribe + hub.verify_token → hub.challenge
//   POST  X-Hub-Signature-256 (HMAC-SHA256 do corpo CRU com o app secret, tempo
//         constante) → cada mudança `leadgen` vai para a fila pela página ATIVA
//         (a equipe nunca vem do corpo) → 200 rápido → processa em segundo plano.
//
// verify_jwt = false (supabase/config.toml). Nada de PII no log: só contagens.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseLeadgenWebhook, verifyChallenge, verifySignature } from "../_shared/meta.ts";
import { createGraph } from "../_shared/meta-graph.ts";
import { processInboundBatch } from "../_shared/meta-ingest.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

const MAX_BODY = 1024 * 1024;
const env = (k: string) => Deno.env.get(k) ?? "";
const text = (b: string, s: number) => new Response(b, { status: s, headers: { "Content-Type": "text/plain" } });

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const challenge = verifyChallenge(url.searchParams, env("META_WEBHOOK_VERIFY_TOKEN"));
    return challenge === null ? text("forbidden", 403) : text(challenge, 200);
  }
  if (req.method !== "POST") return text("method_not_allowed", 405);

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return text("payload_too_large", 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return text("payload_too_large", 413);

  const appSecret = env("META_APP_SECRET");
  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), appSecret))) {
    console.warn("[meta-webhook] assinatura inválida");
    return text("invalid_signature", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return text("bad_json", 400);
  }

  const changes = parseLeadgenWebhook(body, raw);
  if (!changes.length) return text("ok", 200);

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ids: string[] = [];
  let ignored = 0;
  for (const c of changes) {
    const { data, error } = await db.rpc("_crm_meta_enqueue_leadgen", {
      p_page_id: c.page_id,
      p_value: c,
      p_origin: "webhook",
    });
    if (error) {
      // Erro do banco: 500 faz o Meta reenviar (a fila é idempotente).
      console.error("[meta-webhook] enqueue:", error.message);
      return text("retry", 500);
    }
    if (data) ids.push(data as string);
    else ignored++;
  }
  console.log(`[meta-webhook] leadgen: ${changes.length} recebidos, ${ids.length} novos, ${ignored} ignorados/repetidos`);

  if (ids.length) {
    const work = processInboundBatch(db, createGraph({ appId: env("META_APP_ID"), appSecret }), { ids, limit: ids.length })
      .catch((e) => console.error("[meta-webhook] process:", e instanceof Error ? e.message : e));
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
  }
  return text("ok", 200);
});
