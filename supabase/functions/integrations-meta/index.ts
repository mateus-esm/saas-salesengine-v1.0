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
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { highestRole } from "../_shared/team-access.ts";
import { GRAPH_VERSION, metaErrorMessage, oauthDialogUrl, randomToken, sha256Hex } from "../_shared/meta.ts";
import { createGraph, type Graph, MetaGraphError } from "../_shared/meta-graph.ts";

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
  const redirectUri = env("META_REDIRECT_URI");
  const configured = !!(appId && appSecret && configId && redirectUri);
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
    return { configured, graph_version: GRAPH_VERSION, integration: list ?? null, assets: assets ?? [] };
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
