// ============================================================================
// Sprint 16 — Integrações · Windsor.ai
//
// Cada equipe conecta a PRÓPRIA chave do Windsor. A chave vai do navegador para
// cá (HTTPS), é testada no Windsor e guardada no Vault (_crm_integration_store_key).
// Nunca volta: a tela só vê os 4 últimos caracteres.
//
// Ações (JWT de admin/owner da equipe):
//   connect    { api_key, select_accounts? }  testa, guarda, descobre campos e contas, sincroniza 30 dias
//   sync       { days? }                       puxa os últimos N dias (padrão 7, máx. 90)
//   settings   { select_accounts }             filtra contas (ids separados por vírgula; vazio = todas)
//   disconnect {}                              apaga a chave do Vault
// Cron (x-cron-secret = WINDSOR_SYNC_SECRET):
//   sync_all   {}                              todas as equipes conectadas, últimos 3 dias
//                                              (30 na primeira vez)
//
// Um conector que a conta Windsor não tem (sem Google Ads, por exemplo) é pulado,
// não é erro. O gasto vira crm_ad_metrics e, por campanha, crm_campaign_spend.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/asaas.ts";
import { highestRole } from "../_shared/team-access.ts";
import {
  accountsOf,
  chooseFields,
  CONNECTORS,
  CORE_FIELDS,
  type Connector,
  type FieldMap,
  type IngestRow,
  mapFromList,
  normalizeRows,
  parseFieldList,
  requestFields,
  syncWindow,
  windsorError,
  windsorUrl,
} from "../_shared/windsor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Integration {
  id: string;
  equipe_id: string;
  status: string;
  settings: { fields?: Partial<Record<Connector, FieldMap>>; select_accounts?: string; connectors?: Connector[] } | null;
  last_sync_at: string | null;
}

class WindsorAuthError extends Error {}

async function windsorGet(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text.slice(0, 300) };
  }
  return { status: res.status, body };
}

/** The fields this account has for a connector; null = discovery unavailable. */
async function discover(apiKey: string, connector: Connector): Promise<FieldMap | null> {
  try {
    const { status, body } = await windsorGet(windsorUrl(connector, apiKey, {}).replace(`/${connector}?`, `/${connector}/fields?`));
    const err = windsorError(status, body);
    if (err?.auth) throw new WindsorAuthError(err.message);
    if (err) return null;
    const list = parseFieldList(body);
    return list ? chooseFields(connector, list) : null;
  } catch (e) {
    if (e instanceof WindsorAuthError) throw e;
    console.warn("[windsor] discover", connector, e instanceof Error ? e.message : e);
    return null;
  }
}

/** One connector's rows for the window. Refused fields → retry with the core set. */
async function pull(
  apiKey: string,
  connector: Connector,
  map: FieldMap,
  win: { from: string; to: string },
  selectAccounts?: string,
): Promise<{ rows: IngestRow[]; skipped?: string }> {
  const ask = async (m: FieldMap) => {
    const { status, body } = await windsorGet(windsorUrl(connector, apiKey, {
      fields: requestFields(m).join(","),
      date_from: win.from,
      date_to: win.to,
      select_accounts: selectAccounts || undefined,
    }));
    return { status, body, err: windsorError(status, body) };
  };
  let m = map;
  let r = await ask(m);
  if (r.err?.auth) throw new WindsorAuthError(r.err.message);
  if (r.err && r.status === 400) {
    m = mapFromList(connector, CORE_FIELDS[connector]);
    r = await ask(m);
    if (r.err?.auth) throw new WindsorAuthError(r.err.message);
  }
  if (r.err) return { rows: [], skipped: r.err.message };
  const data = (r.body as { data?: unknown[] } | null)?.data;
  return { rows: Array.isArray(data) ? normalizeRows(connector, data, m) : [] };
}

async function ingest(db: SupabaseClient, equipeId: string, rows: IngestRow[]) {
  const totals = { new_ads: 0, metric_rows: 0, linked_touches: 0 };
  for (let i = 0; i < rows.length; i += 2000) {
    const { data, error } = await db.rpc("_crm_windsor_ingest", { p_equipe_id: equipeId, p_rows: rows.slice(i, i + 2000) });
    if (error) throw new Error("ingest: " + error.message);
    const d = (data ?? {}) as Record<string, number>;
    totals.new_ads += d.new_ads ?? 0;
    totals.metric_rows += d.metric_rows ?? 0;
    totals.linked_touches += d.linked_touches ?? 0;
  }
  return totals;
}

async function syncOne(db: SupabaseClient, integ: Integration, days: number) {
  const { data: key, error: keyErr } = await db.rpc("_crm_integration_key", { p_integration_id: integ.id });
  if (keyErr || !key) {
    await db.rpc("_crm_integration_mark", { p_integration_id: integ.id, p_status: "error", p_error: "Chave não encontrada", p_rows: 0 });
    return { ok: false, error: "no_key" };
  }
  const win = syncWindow(days);
  const settings = integ.settings ?? {};
  const fields: Partial<Record<Connector, FieldMap>> = { ...(settings.fields ?? {}) };
  const all: IngestRow[] = [];
  const skipped: string[] = [];
  const accounts: { source: Connector; id: string; name: string | null }[] = [];
  try {
    for (const c of CONNECTORS) {
      if (!fields[c]) fields[c] = (await discover(key as string, c)) ?? chooseFields(c, null);
      const r = await pull(key as string, c, fields[c]!, win, settings.select_accounts);
      if (r.skipped) skipped.push(`${c}: ${r.skipped}`);
      all.push(...r.rows);
      accounts.push(...accountsOf(c, r.rows));
    }
  } catch (e) {
    const msg = e instanceof WindsorAuthError ? `authentication: ${e.message}` : e instanceof Error ? e.message : String(e);
    await db.rpc("_crm_integration_mark", { p_integration_id: integ.id, p_status: "error", p_error: msg, p_rows: 0 });
    return { ok: false, error: msg };
  }

  try {
    const totals = await ingest(db, integ.equipe_id, all);
    const status = skipped.length && skipped.length >= CONNECTORS.length ? "error" : skipped.length ? "partial" : "ok";
    await db.rpc("_crm_integration_mark", {
      p_integration_id: integ.id,
      p_status: status,
      p_error: skipped.length ? skipped.join(" · ") : null,
      p_rows: all.length,
      p_settings: { fields },
    });
    if (accounts.length) {
      await db.from("crm_integrations").update({ accounts }).eq("id", integ.id);
    }
    return { ok: status !== "error", status, rows: all.length, window: win, skipped, ...totals };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.rpc("_crm_integration_mark", { p_integration_id: integ.id, p_status: "error", p_error: msg, p_rows: all.length });
    return { ok: false, error: msg };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  // ── Cron: todas as equipes ──
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== null) {
    const secret = Deno.env.get("WINDSOR_SYNC_SECRET");
    if (!secret || !safeEqual(cronSecret, secret)) return json({ error: "unauthorized" }, 401);
    const { data: list, error } = await db
      .from("crm_integrations")
      .select("id, equipe_id, status, settings, last_sync_at")
      .eq("provider", "windsor")
      .neq("status", "disconnected");
    if (error) return json({ error: error.message }, 500);
    const results = [];
    for (const integ of (list ?? []) as Integration[]) {
      results.push({ equipe_id: integ.equipe_id, ...(await syncOne(db, integ, integ.last_sync_at ? 3 : 30)) });
    }
    return json({ ok: true, results });
  }

  // ── Usuário: admin/owner da equipe ──
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await db.from("profiles").select("id, equipe_id").eq("user_id", user.id).maybeSingle();
  if (!profile?.equipe_id) return json({ error: "no_team" }, 403);
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const role = highestRole((roles ?? []).map((r: { role: string }) => r.role));
  if (role === "user") return json({ error: "Só administradores mexem nas integrações" }, 403);
  const equipeId = profile.equipe_id as string;

  const current = async () => {
    const { data } = await db
      .from("crm_integrations")
      .select("id, equipe_id, status, settings, last_sync_at")
      .eq("equipe_id", equipeId)
      .eq("provider", "windsor")
      .maybeSingle();
    return data as Integration | null;
  };

  try {
    if (action === "connect") {
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (apiKey.length < 8 || /\s/.test(apiKey)) return json({ error: "Chave inválida" }, 400);
      const selectAccounts = typeof body.select_accounts === "string" ? body.select_accounts.replace(/\s+/g, "") : "";

      // Testa a chave descobrindo os campos de cada conector.
      const fields: Partial<Record<Connector, FieldMap>> = {};
      try {
        for (const c of CONNECTORS) {
          const f = await discover(apiKey, c);
          if (f) fields[c] = f;
        }
      } catch (e) {
        if (e instanceof WindsorAuthError) return json({ error: "O Windsor recusou a chave: " + e.message }, 400);
        throw e;
      }
      // Sem descoberta nenhuma, confirma a chave com uma consulta mínima.
      if (!Object.keys(fields).length) {
        const probe = await windsorGet(windsorUrl("all", apiKey, { fields: "source,date", date_preset: "last_7d" }));
        const err = windsorError(probe.status, probe.body);
        if (err?.auth) return json({ error: "O Windsor recusou a chave: " + err.message }, 400);
      }

      const { data: id, error } = await db.rpc("_crm_integration_store_key", {
        p_equipe_id: equipeId,
        p_provider: "windsor",
        p_key: apiKey,
        p_accounts: [],
        p_settings: { fields, select_accounts: selectAccounts },
        p_user: profile.id,
      });
      if (error) return json({ error: error.message }, 500);
      const integ = (await current()) ?? { id, equipe_id: equipeId, status: "connected", settings: { fields }, last_sync_at: null };
      const result = await syncOne(db, integ as Integration, 30);
      return json({ connected: true, sync: result });
    }

    if (action === "sync") {
      const integ = await current();
      if (!integ || integ.status === "disconnected") return json({ error: "Windsor não conectado" }, 400);
      const days = Math.max(1, Math.min(90, Number(body.days) || 7));
      return json(await syncOne(db, integ, days));
    }

    if (action === "settings") {
      const integ = await current();
      if (!integ) return json({ error: "Windsor não conectado" }, 400);
      const selectAccounts = typeof body.select_accounts === "string" ? body.select_accounts.replace(/\s+/g, "") : "";
      const { error } = await db
        .from("crm_integrations")
        .update({ settings: { ...(integ.settings ?? {}), select_accounts: selectAccounts }, updated_at: new Date().toISOString() })
        .eq("id", integ.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "disconnect") {
      const { error } = await db.rpc("_crm_integration_disconnect", { p_equipe_id: equipeId, p_provider: "windsor" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[integrations-windsor]", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
