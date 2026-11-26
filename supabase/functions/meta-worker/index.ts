// ============================================================================
// Sprint 17 — worker do Meta, acordado pelo pg_cron (_crm_meta_tick, 5 min).
//
//   x-cron-secret = META_WORKER_SECRET (tempo constante); verify_jwt = false.
//   1. fila de entrada: leads de formulário que o webhook não terminou
//      (erro do Meta, limite, backfill) — com backoff;
//   2. fila da CAPI: eventos de etapa → POST /{dataset}/events.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/asaas.ts";
import { createGraph } from "../_shared/meta-graph.ts";
import { sendCapiBatch } from "../_shared/meta-capi.ts";
import { processInboundBatch } from "../_shared/meta-ingest.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = env("META_WORKER_SECRET");
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !safeEqual(got, secret)) return json({ error: "unauthorized" }, 401);
  if (!env("META_APP_ID") || !env("META_APP_SECRET")) return json({ skipped: "meta_app_not_configured" });

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const graph = createGraph({ appId: env("META_APP_ID"), appSecret: env("META_APP_SECRET") });

  const started = Date.now();
  const inbound = { claimed: 0, done: 0, failed: 0 };
  // Até ~100 s de leads por rodada; o resto fica para a próxima.
  while (Date.now() - started < 100_000) {
    const r = await processInboundBatch(db, graph, { limit: 25 });
    inbound.claimed += r.claimed;
    inbound.done += r.done;
    inbound.failed += r.failed;
    if (r.claimed < 25) break;
  }
  const capi = await sendCapiBatch(db, graph);
  console.log("[meta-worker]", JSON.stringify({ inbound, capi }));
  return json({ inbound, capi });
});
