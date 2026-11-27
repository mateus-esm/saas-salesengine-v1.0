// ============================================================================
// Sprint 17 — Integrações · Meta (Login for Business, token system-user)
//
// Cada equipe conecta o PRÓPRIO portfólio do Meta ao app único do Rev. O código
// do diálogo OAuth é trocado aqui; o token vai para o Vault e nunca volta.
//
// Ações (JWT de admin/owner da equipe):
//   config      {}                 app_id, config_id, versão, redirect_uri (nada secreto)
//   start       {}                 cria o state (uso único, 10 min) e devolve a URL do diálogo
//   connect     { code, state }    valida o state, troca o código, guarda o token, descobre ativos
//   status      {}                 conta (sem segredo) + ativos
//   rediscover  {}                 descobre os ativos de novo com o token guardado
//   probe       {}                 diagnóstico da Fase 1 (o que o token alcança); nunca devolve token
//   disconnect  {}                 cancela inscrições, apaga do Vault conta e ativos
//   — Fases 2–4 —
//   activate_page   { asset_id }        inscreve o app (leadgen) e pré-sincroniza os formulários
//   deactivate_page { asset_id }        cancela a inscrição
//   forms           { refresh? }        formulários (entradas meta_form) com contagem de leads
//   import_recent   { form_id, days }   backfill (≤ 90 dias) pela mesma fila, sem saudação
//   retry_failed    {}                  devolve à fila o que deu erro/morreu
//   capi_config     {}                  datasets, etapas, mapeamentos, últimos envios
//   capi_save       { dataset_id?, capi_enabled?, mappings?[] }
//   capi_test       { test_event_code } evento sintético em "Testar eventos"
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { highestRole } from "../_shared/team-access.ts";
import { GRAPH_VERSION, metaErrorMessage, oauthDialogUrl, pickRedirectUri, randomToken, sha256Hex } from "../_shared/meta.ts";
import { createGraph, type Graph, MetaGraphError } from "../_shared/meta-graph.ts";
import { processInboundBatch } from "../_shared/meta-ingest.ts";
import { sendCapiTest } from "../_shared/meta-capi.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;
const background = (p: Promise<unknown>) => {
  const w = p.catch((e) => console.error("[integrations-meta] background:", e instanceof Error ? e.message : e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(w);
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const env = (k: string) => Deno.env.get(k) ?? "";

interface MetaIntegration {
  id: string;
  equipe_id: string;
  status: string;
  settings: Record<string, unknown> | null;
}

interface Discovery {
  me: { id: string; name?: string };
  business_id: string | null;
  business_name: string | null;
  assets: { asset_type: "page" | "ad_account" | "dataset"; external_id: string; name: string | null }[];
  pageTokens: Map<string, string>;
  warnings: string[];
}

/** O que a falha de uma descoberta vira: um aviso legível, não um erro. */
const warn = (what: string, e: unknown) =>
  `${what}: ${e instanceof MetaGraphError ? metaErrorMessage({ code: e.code, message: e.message }).message : "falhou"}`;

async function discover(graph: Graph, token: string): Promise<Discovery> {
  const warnings: string[] = [];
  const me = await graph.get<{ id: string; name?: string; client_business_id?: string }>("/me", token, {
    fields: "id,name,client_business_id",
  });
  const businessId = me.client_business_id ?? null;
  let businessName: string | null = null;
  if (businessId) {
    try {
      businessName = (await graph.get<{ name?: string }>(`/${businessId}`, token, { fields: "name" })).name ?? null;
    } catch (e) {
      warnings.push(warn("nome do portfólio", e));
    }
  }

  const pages = new Map<string, { name: string | null; token?: string }>();
  try {
    for (const p of await graph.paginate<{ id: string; name?: string; access_token?: string }>("/me/accounts", token, {
      fields: "id,name,access_token",
      limit: "100",
    })) pages.set(p.id, { name: p.name ?? null, token: p.access_token });
  } catch (e) {
    warnings.push(warn("páginas (/me/accounts)", e));
  }
  if (businessId) {
    for (const edge of ["owned_pages", "client_pages"]) {
      try {
        for (const p of await graph.paginate<{ id: string; name?: string }>(`/${businessId}/${edge}`, token, { fields: "id,name", limit: "100" })) {
          if (!pages.has(p.id)) pages.set(p.id, { name: p.name ?? null });
        }
      } catch (e) {
        warnings.push(warn(`páginas (${edge})`, e));
      }
    }
  }
  // Plano B do token de página: pedir direto à página.
  for (const [id, p] of pages) {
    if (p.token) continue;
    try {
      const r = await graph.get<{ access_token?: string }>(`/${id}`, token, { fields: "access_token" });
      if (r.access_token) p.token = r.access_token;
    } catch {
      // sem token de página: as leituras usam o token system-user (plano C)
    }
  }

  const adAccounts: { id: string; name: string | null }[] = [];
  try {
    for (const a of await graph.paginate<{ id: string; name?: string }>("/me/adaccounts", token, { fields: "id,name", limit: "100" })) {
      adAccounts.push({ id: a.id, name: a.name ?? null });
    }
  } catch (e) {
    warnings.push(warn("contas de anúncio", e));
  }

  const datasets = new Map<string, string | null>();
  for (const a of adAccounts.slice(0, 10)) {
    try {
      for (const d of await graph.paginate<{ id: string; name?: string }>(`/${a.id}/adspixels`, token, { fields: "id,name", limit: "100" }, 2)) {
        datasets.set(d.id, d.name ?? null);
      }
    } catch (e) {
      warnings.push(warn(`pixels de ${a.name ?? a.id}`, e));
    }
  }
  if (businessId) {
    try {
      for (const d of await graph.paginate<{ id: string; name?: string }>(`/${businessId}/owned_pixels`, token, { fields: "id,name", limit: "100" }, 2)) {
        if (!datasets.has(d.id)) datasets.set(d.id, d.name ?? null);
      }
    } catch (e) {
      warnings.push(warn("pixels do portfólio", e));
    }
  }

  const pageTokens = new Map<string, string>();
  for (const [id, p] of pages) if (p.token) pageTokens.set(id, p.token);
  return {
    me: { id: me.id, name: me.name },
    business_id: businessId,
    business_name: businessName,
    assets: [
      ...[...pages].map(([id, p]) => ({ asset_type: "page" as const, external_id: id, name: p.name })),
      ...adAccounts.map((a) => ({ asset_type: "ad_account" as const, external_id: a.id, name: a.name })),
      ...[...datasets].map(([id, name]) => ({ asset_type: "dataset" as const, external_id: id, name })),
    ],
    pageTokens,
    warnings,
  };
}

async function grantedScopes(graph: Graph, token: string): Promise<{ scopes: string[]; type: string | null; expires_at: number | null }> {
  try {
    const r = await graph.get<{ data?: { scopes?: string[]; type?: string; expires_at?: number } }>("/debug_token", graph.appToken(), {
      input_token: token,
    });
    return { scopes: r.data?.scopes ?? [], type: r.data?.type ?? null, expires_at: r.data?.expires_at ?? null };
  } catch {
    return { scopes: [], type: null, expires_at: null };
  }
}

async function saveDiscovery(db: SupabaseClient, integrationId: string, d: Discovery) {
  const { error } = await db.rpc("_crm_meta_assets_sync", { p_integration: integrationId, p_assets: d.assets });
  if (error) throw new Error("assets: " + error.message);
  if (!d.pageTokens.size) return;
  const { data: rows } = await db
    .from("crm_integration_assets")
    .select("id, external_id")
    .eq("integration_id", integrationId)
    .eq("asset_type", "page")
    .neq("status", "disconnected");
  for (const r of (rows ?? []) as { id: string; external_id: string }[]) {
    const t = d.pageTokens.get(r.external_id);
    if (t) await db.rpc("_crm_asset_store_secret", { p_asset: r.id, p_token: t });
  }
}

async function markError(db: SupabaseClient, integrationId: string, e: unknown) {
  const m = e instanceof MetaGraphError ? metaErrorMessage({ code: e.code, message: e.message }) : null;
  await db.from("crm_integrations").update({
    status: m?.reconnect ? "error" : "connected",
    last_sync_error: (m?.message ?? (e instanceof Error ? e.message : String(e))).slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq("id", integrationId);
}

function errorResponse(e: unknown) {
  if (e instanceof MetaGraphError) {
    const m = metaErrorMessage({ code: e.code, message: e.message });
    return json({ error: m.message, code: m.code, reconnect: m.reconnect }, 400);
  }
  console.error("[integrations-meta]", e instanceof Error ? e.message : e);
  return json({ error: e instanceof Error ? e.message : "erro" }, 500);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  // ── Só admin/owner da equipe da sessão (equipe_id nunca vem do body) ──
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: { user }, error: authErr } = await db.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await db.from("profiles").select("id, equipe_id").eq("user_id", user.id).maybeSingle();
  if (!profile?.equipe_id) return json({ error: "no_team" }, 403);
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const role = highestRole((roles ?? []).map((r: { role: string }) => r.role));
  if (role === "user") return json({ error: "Só administradores mexem nas integrações" }, 403);
  const equipeId = profile.equipe_id as string;

  const appId = env("META_APP_ID");
  const appSecret = env("META_APP_SECRET");
  const configId = env("META_LOGIN_CONFIG_ID");
  const defaultRedirectUri = env("META_REDIRECT_URI");
  const configured = !!(appId && appSecret && configId && defaultRedirectUri);
  // Volta para o domínio do nicho onde o admin está (a sessão é por domínio).
  const redirectUri = pickRedirectUri(body.origin, defaultRedirectUri, env("META_REDIRECT_ORIGINS"));
  const graph = createGraph({ appId, appSecret });

  const current = async () => {
    const { data } = await db
      .from("crm_integrations")
      .select("id, equipe_id, status, settings")
      .eq("equipe_id", equipeId)
      .eq("provider", "meta")
      .maybeSingle();
    return data as MetaIntegration | null;
  };
  const tokenOf = async (integ: MetaIntegration) => {
    const { data } = await db.rpc("_crm_integration_key", { p_integration_id: integ.id });
    return (data as string | null) ?? null;
  };
  const statusPayload = async () => {
    const { data: list } = await db
      .from("crm_integrations")
      .select("id, provider, status, key_last4, settings, last_sync_at, last_sync_status, last_sync_error, connected_by, updated_at")
      .eq("equipe_id", equipeId)
      .eq("provider", "meta")
      .maybeSingle();
    const { data: assets } = await db.rpc("_crm_integration_assets_for", { p_equipe: equipeId });
    const { data: evs } = await db.from("crm_inbound_events")
      .select("status, received_at, processed_at, last_error, external_id, origin, attempts")
      .eq("equipe_id", equipeId).order("received_at", { ascending: false }).limit(500);
    const rows = (evs ?? []) as {
      status: string;
      received_at: string;
      processed_at: string | null;
      last_error: string | null;
      external_id: string;
      origin: string;
      attempts: number;
    }[];
    const count = (st: string) => rows.filter((r) => r.status === st).length;
    const queue = {
      queued: count("queued") + count("processing"),
      done: count("done"),
      error: count("error"),
      dead: count("dead"),
      last_lead_at: rows.find((r) => r.status === "done")?.processed_at ?? null,
      recent_errors: rows.filter((r) => r.status === "error" || r.status === "dead").slice(0, 5)
        .map((r) => ({ leadgen_id: r.external_id, status: r.status, error: r.last_error, received_at: r.received_at, attempts: r.attempts })),
    };
    return { configured, graph_version: GRAPH_VERSION, integration: list ?? null, assets: assets ?? [], queue };
  };

  try {
    if (action === "config") {
      return json({ configured, app_id: appId || null, config_id: configId || null, graph_version: GRAPH_VERSION, redirect_uri: redirectUri || null });
    }

    if (action === "status") return json(await statusPayload());

    if (!configured) return json({ error: "O app do Meta ainda não foi configurado no Rev." }, 503);

    if (action === "start") {
      const nonce = randomToken();
      const { error } = await db.rpc("_crm_oauth_create", {
        p_provider: "meta",
        p_equipe: equipeId,
        p_user: profile.id,
        p_nonce_hash: await sha256Hex(nonce),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ url: oauthDialogUrl({ appId, configId, redirectUri, state: nonce }) });
    }

    if (action === "connect") {
      const code = typeof body.code === "string" ? body.code : "";
      const state = typeof body.state === "string" ? body.state : "";
      if (!code || !state) return json({ error: "Faltou o código ou o state do Meta" }, 400);
      const { data: ok, error: stErr } = await db.rpc("_crm_oauth_consume", {
        p_provider: "meta",
        p_nonce_hash: await sha256Hex(state),
        p_equipe: equipeId,
        p_user: profile.id,
      });
      if (stErr) return json({ error: stErr.message }, 500);
      if (!ok) return json({ error: "Este link de conexão expirou ou não é seu. Clique em Conectar de novo." }, 400);

      const token = await graph.exchangeCode(code, redirectUri);
      const d = await discover(graph, token);
      const dbg = await grantedScopes(graph, token);
      const { data: integrationId, error } = await db.rpc("_crm_integration_store_key", {
        p_equipe_id: equipeId,
        p_provider: "meta",
        p_key: token,
        p_accounts: [],
        p_settings: {
          fb_user_id: d.me.id,
          fb_user_name: d.me.name ?? null,
          business_id: d.business_id,
          business_name: d.business_name,
          token_type: dbg.type ?? "system_user",
          token_expires_at: dbg.expires_at,
          granted_scopes: dbg.scopes,
          graph_version: GRAPH_VERSION,
          lead_event_source: "Rev",
          capi_enabled: false,
          discovery_warnings: d.warnings,
        },
        p_user: profile.id,
      });
      if (error) return json({ error: error.message }, 500);
      await saveDiscovery(db, integrationId as string, d);
      return json({ connected: true, ...(await statusPayload()) });
    }

    const integ = await current();
    if (!integ || integ.status === "disconnected") return json({ error: "Meta não conectado" }, 400);

    if (action === "rediscover") {
      const token = await tokenOf(integ);
      if (!token) return json({ error: "Token não encontrado. Reconecte.", reconnect: true }, 400);
      try {
        const d = await discover(graph, token);
        await saveDiscovery(db, integ.id, d);
        await db.from("crm_integrations").update({
          status: "connected",
          last_sync_error: null,
          settings: { ...(integ.settings ?? {}), discovery_warnings: d.warnings },
          updated_at: new Date().toISOString(),
        }).eq("id", integ.id);
      } catch (e) {
        await markError(db, integ.id, e);
        throw e;
      }
      return json(await statusPayload());
    }

    if (action === "probe") {
      // Fase 1: responde as perguntas que a doc do Meta não responde. Só fatos, nunca token.
      const token = await tokenOf(integ);
      if (!token) return json({ error: "Token não encontrado. Reconecte.", reconnect: true }, 400);
      const out: Record<string, unknown> = { scopes: (await grantedScopes(graph, token)).scopes };
      const try_ = async (k: string, f: () => Promise<unknown>) => {
        try {
          out[k] = { ok: true, value: await f() };
        } catch (e) {
          out[k] = { ok: false, code: e instanceof MetaGraphError ? e.code : null, error: e instanceof Error ? e.message : String(e) };
        }
      };
      const { data: pageRows } = await db.from("crm_integration_assets")
        .select("id, external_id, secret_id").eq("integration_id", integ.id).eq("asset_type", "page").neq("status", "disconnected");
      const pages = (pageRows ?? []) as { id: string; external_id: string; secret_id: string | null }[];
      out.pages = pages.length;
      out.pages_with_token = pages.filter((p) => p.secret_id).length;
      const page = pages.find((p) => p.secret_id) ?? pages[0];
      if (page) {
        const pt = page.secret_id ? ((await db.rpc("_crm_asset_secret", { p_asset: page.id })).data as string | null) : null;
        const t = pt ?? token;
        out.page_token_source = pt ? "page_token" : "system_user_token";
        let formId: string | null = null;
        await try_("leadgen_forms", async () => {
          const r = await graph.get<{ data?: { id: string; name?: string; status?: string }[] }>(`/${page.external_id}/leadgen_forms`, t, {
            fields: "id,name,status",
            limit: "5",
          });
          formId = r.data?.[0]?.id ?? null;
          return { count: r.data?.length ?? 0 };
        });
        let adId: string | null = null;
        if (formId) {
          const full = "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,is_organic,platform";
          await try_("lead_full_fields", async () => {
            const r = await graph.get<{ data?: Record<string, unknown>[] }>(`/${formId}/leads`, t, { fields: full, limit: "1" });
            const l = r.data?.[0];
            adId = (l?.ad_id as string | undefined) ?? null;
            return { leads: r.data?.length ?? 0, keys: l ? Object.keys(l).filter((k) => k !== "field_data") : [] };
          });
          if (!adId) {
            await try_("lead_core_fields", async () => {
              const r = await graph.get<{ data?: Record<string, unknown>[] }>(`/${formId}/leads`, t, {
                fields: "id,created_time,ad_id,form_id",
                limit: "1",
              });
              adId = (r.data?.[0]?.ad_id as string | undefined) ?? null;
              return { leads: r.data?.length ?? 0 };
            });
          }
          await try_("form_name", async () => (await graph.get<{ name?: string }>(`/${formId}`, t, { fields: "name" })).name ?? null);
        }
        if (adId) {
          await try_("ad_metadata", async () =>
            await graph.get(`/${adId}`, token, { fields: "name,adset{id,name},campaign{id,name}" })
          );
        }
      }
      return json(out);
    }

    const ownAsset = async (id: unknown, type: "page" | "dataset") => {
      if (typeof id !== "string" || !id) return null;
      const { data } = await db.from("crm_integration_assets")
        .select("id, external_id, name, status, secret_id").eq("id", id).eq("integration_id", integ.id).eq("asset_type", type)
        .neq("status", "disconnected").maybeSingle();
      return data as { id: string; external_id: string; name: string | null; status: string; secret_id: string | null } | null;
    };
    const pageToken = async (assetId: string) => {
      const { data } = await db.rpc("_crm_asset_secret", { p_asset: assetId });
      return (data as string | null) ?? (await tokenOf(integ));
    };
    const syncForms = async (page: { id: string; external_id: string }, token: string) => {
      try {
        const forms = await graph.paginate<{ id: string; name?: string }>(`/${page.external_id}/leadgen_forms`, token, {
          fields: "id,name,status",
          limit: "100",
        }, 5);
        for (const f of forms) {
          await db.rpc("_crm_entry_for_meta_form", { p_equipe: equipeId, p_page: page.external_id, p_form: f.id, p_form_name: f.name ?? null });
        }
        return { forms: forms.length, warning: null as string | null };
      } catch (e) {
        return { forms: 0, warning: warn("formulários da página", e) };
      }
    };

    if (action === "activate_page") {
      const page = await ownAsset(body.asset_id, "page");
      if (!page) return json({ error: "Página não encontrada nesta conexão." }, 404);
      const { error: stErr } = await db.rpc("_crm_asset_set_status", { p_asset: page.id, p_status: "active" });
      if (stErr) {
        return json({
          error: /asset_active_elsewhere/.test(stErr.message)
            ? "Esta página já recebe leads em outra equipe do Rev. Desative lá antes de ativar aqui."
            : stErr.message,
        }, 409);
      }
      const token = await pageToken(page.id);
      if (!token) return json({ error: "Token não encontrado. Reconecte.", reconnect: true }, 400);
      try {
        await graph.post(`/${page.external_id}/subscribed_apps`, token, { subscribed_fields: "leadgen" });
      } catch (e) {
        const m = e instanceof MetaGraphError ? metaErrorMessage({ code: e.code, message: e.message }) : null;
        await db.rpc("_crm_asset_set_status", { p_asset: page.id, p_status: "available", p_error: m?.message ?? "Falha ao inscrever a página" });
        if (m?.code === "token_invalid") await markError(db, integ.id, e);
        throw e;
      }
      const forms = await syncForms(page, token);
      return json({ ok: true, forms_found: forms.forms, forms_warning: forms.warning, ...(await statusPayload()) });
    }

    if (action === "deactivate_page") {
      const page = await ownAsset(body.asset_id, "page");
      if (!page) return json({ error: "Página não encontrada nesta conexão." }, 404);
      try {
        await graph.del(`/${page.external_id}/subscribed_apps`, graph.appToken());
      } catch (e) {
        console.warn("[integrations-meta] unsubscribe", page.external_id, e instanceof MetaGraphError ? e.code : "");
      }
      await db.rpc("_crm_asset_set_status", { p_asset: page.id, p_status: "available" });
      return json({ ok: true, ...(await statusPayload()) });
    }

    if (action === "forms") {
      if (body.refresh === true) {
        const { data: actives } = await db.from("crm_integration_assets")
          .select("id, external_id").eq("integration_id", integ.id).eq("asset_type", "page").eq("status", "active");
        for (const p of (actives ?? []) as { id: string; external_id: string }[]) {
          const t = await pageToken(p.id);
          if (t) await syncForms(p, t);
        }
      }
      const { data: entries } = await db.from("crm_entries")
        .select("id, name, meta_form_id, meta_page_id, pipeline_id, active")
        .eq("equipe_id", equipeId).eq("kind", "meta_form").order("name");
      const { data: touches } = await db.from("lead_touches")
        .select("form_id, occurred_at").eq("equipe_id", equipeId).not("leadgen_id", "is", null)
        .order("occurred_at", { ascending: false }).limit(2000);
      const stats = new Map<string, { leads: number; last: string | null }>();
      for (const t of (touches ?? []) as { form_id: string | null; occurred_at: string }[]) {
        if (!t.form_id) continue;
        const s0 = stats.get(t.form_id) ?? { leads: 0, last: null };
        s0.leads++;
        s0.last = s0.last ?? t.occurred_at;
        stats.set(t.form_id, s0);
      }
      type FormEntry = { id: string; name: string; meta_form_id: string; meta_page_id: string | null; pipeline_id: string | null; active: boolean };
      return json({
        forms: ((entries ?? []) as FormEntry[]).map((e) => ({
          ...e,
          leads: stats.get(e.meta_form_id)?.leads ?? 0,
          last_lead_at: stats.get(e.meta_form_id)?.last ?? null,
        })),
      });
    }

    if (action === "import_recent") {
      const formId = typeof body.form_id === "string" ? body.form_id : "";
      const days = Math.max(1, Math.min(90, Number(body.days) || 30));
      const { data: entry } = await db.from("crm_entries").select("meta_page_id")
        .eq("equipe_id", equipeId).eq("kind", "meta_form").eq("meta_form_id", formId).maybeSingle();
      if (!entry?.meta_page_id) return json({ error: "Formulário não encontrado." }, 404);
      const { data: page } = await db.from("crm_integration_assets").select("id, external_id")
        .eq("integration_id", integ.id).eq("asset_type", "page").eq("external_id", entry.meta_page_id).eq("status", "active")
        .maybeSingle();
      if (!page) return json({ error: "Ative a página deste formulário antes de importar." }, 400);
      const token = await pageToken(page.id);
      if (!token) return json({ error: "Token não encontrado. Reconecte.", reconnect: true }, 400);
      const since = Math.floor(Date.now() / 1000) - days * 86400;
      const leads = await graph.paginate<{ id: string; created_time?: string; ad_id?: string; form_id?: string }>(`/${formId}/leads`, token, {
        fields: "id,created_time,ad_id,form_id",
        limit: "100",
        filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]),
      }, 50);
      let queued = 0;
      for (const l of leads) {
        const { data } = await db.rpc("_crm_meta_enqueue_leadgen", {
          p_page_id: page.external_id,
          p_value: { leadgen_id: String(l.id), form_id: l.form_id ?? formId, ad_id: l.ad_id ?? null },
          p_origin: "backfill",
        });
        if (data) queued++;
      }
      if (queued) background(processInboundBatch(db, graph, { limit: 25 }));
      return json({ found: leads.length, queued, already: leads.length - queued, days });
    }

    if (action === "retry_failed") {
      const { data: n, error } = await db.rpc("_crm_inbound_retry", { p_equipe: equipeId });
      if (error) return json({ error: error.message }, 500);
      if (n) background(processInboundBatch(db, graph, { limit: 25 }));
      return json({ retried: n ?? 0, ...(await statusPayload()) });
    }

    if (action === "capi_config") {
      const { data: pipes } = await db.from("pipelines").select("id, name").eq("equipe_id", equipeId).order("name");
      const { data: stages } = await db.from("pipeline_stages_v2").select("id, name, pipeline_id, position")
        .eq("equipe_id", equipeId).is("deleted_at", null).order("position");
      const { data: maps } = await db.from("crm_conversion_mappings").select("stage_id, event_name, active")
        .eq("equipe_id", equipeId).eq("provider", "meta");
      const { data: recent } = await db.from("crm_conversion_events")
        .select("id, event_name, status, skip_reason, match_key, last_error, created_at, sent_at, test_event_code, response")
        .eq("equipe_id", equipeId).order("created_at", { ascending: false }).limit(15);
      const st = integ.settings ?? {};
      return json({
        dataset_id: st.dataset_id ?? null,
        capi_enabled: st.capi_enabled === true,
        lead_event_source: st.lead_event_source ?? "Rev",
        pipelines: pipes ?? [],
        stages: stages ?? [],
        mappings: maps ?? [],
        recent: ((recent ?? []) as Record<string, unknown>[]).map((r) => {
          const res = r.response as Record<string, unknown> | null;
          return { ...r, response: res ? { events_received: res.events_received ?? null, fbtrace_id: res.fbtrace_id ?? null } : null };
        }),
      });
    }

    if (action === "capi_save") {
      const patch: Record<string, unknown> = {};
      if ("dataset_id" in body) {
        if (body.dataset_id === null || body.dataset_id === "") patch.dataset_id = null;
        else {
          const { data: ds } = await db.from("crm_integration_assets").select("external_id")
            .eq("integration_id", integ.id).eq("asset_type", "dataset").eq("external_id", String(body.dataset_id))
            .neq("status", "disconnected").maybeSingle();
          if (!ds) return json({ error: "Pixel/Dataset não compartilhado nesta conexão." }, 400);
          patch.dataset_id = ds.external_id;
        }
      }
      if (typeof body.capi_enabled === "boolean") patch.capi_enabled = body.capi_enabled;
      const next = { ...(integ.settings ?? {}), ...patch };
      if (next.capi_enabled === true && !next.dataset_id) return json({ error: "Escolha o Pixel/Dataset antes de ligar a CAPI." }, 400);
      if (Object.keys(patch).length) {
        await db.from("crm_integrations").update({ settings: next, updated_at: new Date().toISOString() }).eq("id", integ.id);
      }
      const maps = Array.isArray(body.mappings) ? body.mappings as { stage_id?: unknown; event_name?: unknown; active?: unknown }[] : [];
      for (const m of maps) {
        const { error } = await db.rpc("_crm_capi_save_mapping", {
          p_equipe: equipeId,
          p_stage: String(m.stage_id ?? ""),
          p_event_name: String(m.event_name ?? ""),
          p_active: typeof m.active === "boolean" ? m.active : null,
        });
        if (error) {
          return json({
            error: /invalid_event_name/.test(error.message) ? "Nome de evento inválido: use letras, números e _ (até 50)." : error.message,
          }, 400);
        }
      }
      return json({ ok: true });
    }

    if (action === "capi_test") {
      const code = typeof body.test_event_code === "string" ? body.test_event_code.trim() : "";
      if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) {
        return json({ error: "Cole o código de teste do Gerenciador de Eventos (ex.: TEST12345)." }, 400);
      }
      const st = integ.settings ?? {};
      if (!st.dataset_id) return json({ error: "Escolha o Pixel/Dataset primeiro." }, 400);
      const token = await tokenOf(integ);
      if (!token) return json({ error: "Token não encontrado. Reconecte.", reconnect: true }, 400);
      const r = await sendCapiTest(db, graph, {
        equipeId,
        dataset: String(st.dataset_id),
        token,
        testCode: code,
        leadEventSource: String(st.lead_event_source ?? "Rev"),
      });
      return json(r, r.ok ? 200 : 400);
    }

    if (action === "disconnect") {
      const { data: active } = await db.from("crm_integration_assets")
        .select("external_id").eq("integration_id", integ.id).eq("asset_type", "page").eq("status", "active");
      for (const p of (active ?? []) as { external_id: string }[]) {
        try {
          await graph.del(`/${p.external_id}/subscribed_apps`, graph.appToken());
        } catch (e) {
          console.warn("[integrations-meta] unsubscribe", p.external_id, e instanceof MetaGraphError ? e.code : "");
        }
      }
      const { error } = await db.rpc("_crm_integration_disconnect", { p_equipe_id: equipeId, p_provider: "meta" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return errorResponse(e);
  }
});
