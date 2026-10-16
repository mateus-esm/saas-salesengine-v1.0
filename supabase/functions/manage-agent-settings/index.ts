import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_ENGINE_BASE = 'https://api.gptmaker.ai/v2';

// Credit pricing (provider price + resale markup) lives in one place.
import type { ModelInfo } from "../_shared/credit-pricing.ts";
import {
  decideRefresh, fetchProviderModels, localPublicCatalog, mergeCatalog, PROVIDER_TIMEOUT_MS,
  type ProviderModel,
} from "../_shared/model-catalog.ts";

const MODEL_CATALOG: ModelInfo[] = [
  { id: 'GPT_5',                 label: 'GPT-5',          vendor: 'OpenAI',    providerCredits: 4 },
  { id: 'GPT_5_MINI',            label: 'GPT-5 Mini',     vendor: 'OpenAI',    providerCredits: 1 },
  { id: 'GPT_5_MINI_V2',         label: 'GPT-5 Mini v2',  vendor: 'OpenAI',    providerCredits: 1, isNew: true },
  { id: 'GPT_5_1',               label: 'GPT-5.1',        vendor: 'OpenAI',    providerCredits: 4 },
  { id: 'GPT_5_2',               label: 'GPT-5.2',        vendor: 'OpenAI',    providerCredits: 5 },
  { id: 'GPT_4_1',               label: 'GPT-4.1',        vendor: 'OpenAI',    providerCredits: 4 },
  { id: 'GPT_4_1_MINI',          label: 'GPT-4.1 Mini',   vendor: 'OpenAI',    providerCredits: 1 },
  { id: 'GPT_4_O',               label: 'GPT-4o',         vendor: 'OpenAI',    providerCredits: 5 },
  { id: 'GPT_4_O_MINI',          label: 'GPT-4o Mini',    vendor: 'OpenAI',    providerCredits: 1 },
  { id: 'GPT_4_TURBO',           label: 'GPT-4 Turbo',    vendor: 'OpenAI',    providerCredits: 20 },
  { id: 'GPT_4',                 label: 'GPT-4',          vendor: 'OpenAI',    providerCredits: 20 },
  { id: 'OPEN_AI_O1',            label: 'o1',             vendor: 'OpenAI',    providerCredits: 25 },
  { id: 'OPEN_AI_O3',            label: 'o3',             vendor: 'OpenAI',    providerCredits: 5 },
  { id: 'OPEN_AI_O3_MINI',       label: 'o3 Mini',        vendor: 'OpenAI',    providerCredits: 3 },
  // ⚠️ Digit-zero, not letter-O. The published enum spells these `OPEN_AI_04`
  // and `OPEN_AI_03_MINI_BETA`; this file previously used `O4`/`O3`, which the
  // provider would reject on select. Unlike the model list below — where live
  // traffic positively contradicts the docs — there is no live evidence for
  // either spelling here, so the only evidence available wins.
  { id: 'OPEN_AI_04',            label: 'o4',             vendor: 'OpenAI',    providerCredits: 5 },
  { id: 'OPEN_AI_O4_MINI',       label: 'o4 Mini',        vendor: 'OpenAI',    providerCredits: 3 },
  { id: 'OPEN_AI_03_MINI_BETA',  label: 'o3 Mini (Beta)', vendor: 'OpenAI',    providerCredits: 3, isBeta: true },

  // ── Anthropic ────────────────────────────────────────────────────────────
  // Sonnet 5 and Sonnet 4.6 are in the provider's dashboard dropdown (founder,
  // 2026-08-14) but in no published enum — the docs list only the four below.
  // Their ids follow the provider's own naming pattern (CLAUDE_<maj>_<min>_SONNET)
  // and are NOT confirmed against live traffic. If a slug is wrong the provider
  // rejects the PUT and `upstreamError` surfaces its body verbatim, so it fails
  // loudly on first select rather than silently. Correct here once observed.
  { id: 'CLAUDE_5_SONNET',       label: 'Claude Sonnet 5',   vendor: 'Anthropic', providerCredits: 10, isNew: true, unverifiedPrice: true },
  { id: 'CLAUDE_4_6_SONNET',     label: 'Claude Sonnet 4.6', vendor: 'Anthropic', providerCredits: 10, isNew: true, unverifiedPrice: true },
  { id: 'CLAUDE_4_5_SONNET',     label: 'Claude 4.5 Sonnet', vendor: 'Anthropic', providerCredits: 10 },
  { id: 'CLAUDE_3_7_SONNET',     label: 'Claude 3.7 Sonnet', vendor: 'Anthropic', providerCredits: 10 },
  { id: 'CLAUDE_3_5_SONNET',     label: 'Claude 3.5 Sonnet', vendor: 'Anthropic', providerCredits: 10 },
  { id: 'CLAUDE_3_5_HAIKU',      label: 'Claude 3.5 Haiku',  vendor: 'Anthropic', providerCredits: 2 },
  { id: 'DEEPINFRA_LLAMA3_3',    label: 'Llama 3.3',      vendor: 'Meta',      providerCredits: 1 },
  { id: 'QWEN_2_5_MAX',          label: 'Qwen 2.5 Max',   vendor: 'Alibaba',   providerCredits: 3 },
  { id: 'DEEPSEEK_CHAT',         label: 'DeepSeek V3',    vendor: 'Deepseek',  providerCredits: 1 },
  { id: 'SABIA_3',               label: 'Sabiá 3',        vendor: 'Maritaca',  providerCredits: 3 },
  { id: 'SABIA_3_1',             label: 'Sabiá 3.1',      vendor: 'Maritaca',  providerCredits: 3 },

  // ── Live-only slugs (T0 spike, 2026-08-08) ───────────────────────────────
  // These are what the provider ACTUALLY runs. They appear in the live
  // /settings response and in credits-spent, but in no published enum.
  // `GPT_5_6_SOL` is Solo Energia's current prefferModel — omitting it would
  // make the tenant's own model unselectable.
  // GPT_5_6_SOL: 14 provider credits CONFIRMED by the founder 2026-08-18
  // (was 7 here — an estimate, and exactly the figure that made the UI wrong).
  { id: 'GPT_5_6_SOL',           label: 'GPT-5.6 Sol',    vendor: 'OpenAI',    providerCredits: 14, isNew: true },
  { id: 'GPT_5_6_TERRA',         label: 'GPT-5.6 Terra',  vendor: 'OpenAI',    providerCredits: 5, isNew: true, unverifiedPrice: true },
  { id: 'GPT_5_4',               label: 'GPT-5.4',        vendor: 'OpenAI',    providerCredits: 7, unverifiedPrice: true },
];

// Reconciled with the T0 live capture. `resumeTransferHumanAI` is returned
// live but is undocumented; `onLackKnowLedge` is documented but NOT returned
// live — keep it writable, never require it on read.
const SETTINGS_KEYS = [
  'prefferModel', 'timezone', 'enabledHumanTransfer', 'enabledReminder',
  'splitMessages', 'enabledEmoji', 'limitSubjects', 'signMessages',
  'messageGroupingTime', 'maxDailyMessages', 'maxDailyMessagesLimitAction',
  'knowledgeByFunction', 'onLackKnowLedge', 'resumeTransferHumanAI',
] as const;

// A rota da lista de modelos NÃO está nos docs publicados nem no
// sprint_7.2_api_reference.md: `/models` é a suposição, sobrescrevível por
// secret sem redeploy. Sonda pré-deploy pendente — se errar, o provedor devolve
// 404, caímos no cache/catálogo local e nada quebra.
const MODELS_PATH = Deno.env.get('GPT_MAKER_MODELS_PATH') ?? '/models';

// deno-lint-ignore no-explicit-any
async function loadModels(opts: { supabase: any; engineHeaders: Record<string, string>; agentId: string; force: boolean }) {
  const { supabase, engineHeaders, agentId, force } = opts;

  const { data: cachedRows } = await supabase
    .from('ai_model_catalog').select('id,label,vendor,synced_at');
  const cached: ProviderModel[] = (cachedRows ?? []).map(
    (r: { id: string; label: string | null; vendor: string | null }) => ({
      id: r.id, ...(r.label ? { label: r.label } : {}), ...(r.vendor ? { vendor: r.vendor } : {}),
    }));
  const lastSync = (cachedRows ?? []).reduce(
    (m: number | null, r: { synced_at: string }) => {
      const t = Date.parse(r.synced_at);
      return m === null || t > m ? t : m;
    }, null);

  const { data: state } = await supabase
    .from('ai_model_catalog_state').select('last_attempt_at').eq('id', true).maybeSingle();
  const lastAttempt = state?.last_attempt_at ? Date.parse(state.last_attempt_at) : null;

  let list: ProviderModel[] | null = cached.length ? cached : null;
  let source: 'provider' | 'cache' | 'local' = cached.length ? 'cache' : 'local';
  let stale = false;

  if (decideRefresh(cached.length ? lastSync : null, lastAttempt, Date.now(), force) === 'refresh') {
    // Marca a tentativa ANTES: sucesso ou falha, ninguém chama o provedor de novo em ~1 min.
    await supabase.from('ai_model_catalog_state')
      .upsert({ id: true, last_attempt_at: new Date().toISOString() }, { onConflict: 'id' });
    try {
      // Lança em HTTP != 2xx, timeout e lista vazia (ver fetchProviderModels).
      const fresh = await fetchProviderModels(fetch, `${AI_ENGINE_BASE}${MODELS_PATH}`, engineHeaders);
      const now = new Date().toISOString();
      // upsert (e não replace) para preservar alerted_at dos ids que ficam.
      await supabase.from('ai_model_catalog').upsert(
        fresh.map((m) => ({ id: m.id, label: m.label ?? null, vendor: m.vendor ?? null, synced_at: now })),
        { onConflict: 'id' },
      );
      await supabase.from('ai_model_catalog').delete()
        .not('id', 'in', `(${fresh.map((m) => `"${m.id}"`).join(',')})`);
      list = fresh;
      source = 'provider';
    } catch (err) {
      // Falha do provedor: serve o último cache (ou o catálogo local).
      console.error('models refresh failed, serving cache:', err);
      stale = true;
    }
  }

  // Modelo em uso hoje pelo agente desta equipe; falhar aqui não derruba a lista.
  const inUse: string[] = [];
  try {
    const sRes = await fetch(`${AI_ENGINE_BASE}/agent/${agentId}/settings`, {
      headers: engineHeaders, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (sRes.ok) {
      const s = await sRes.json();
      if (typeof s?.prefferModel === 'string') inUse.push(s.prefferModel);
    }
  } catch (_) { /* sem inUse */ }

  const { models, unpriced } = mergeCatalog({ local: MODEL_CATALOG, provider: list, inUse });

  // Alerta ao painel admin: a RPC só dispara uma vez por modelo (alerted_at).
  for (const id of unpriced) {
    const { error } = await supabase.rpc('ai_model_alert_unpriced', { p_model_id: id });
    if (error) console.error('ai_model_alert_unpriced failed:', id, error.message);
  }

  // `catalog`: tabela local inteira, para o painel de uso resolver rótulo/custo de ids históricos.
  return { models, catalog: localPublicCatalog(MODEL_CATALOG), source, stale };
}

// The whole bug in one function: which upstream resource an action targets.
export function upstreamFor(action: string, agentId: string): string {
  const base = `${AI_ENGINE_BASE}/agent/${agentId}`;
  return (action === 'update-settings' || action === 'update-model')
    ? `${base}/settings`
    : base;
}

// Surface the provider's body verbatim so a wrong enum is diagnosable.
async function upstreamError(res: Response, label: string): Promise<Response> {
  const body = await res.text();
  console.error(`AI Engine ${label} error ${res.status}: ${body}`);
  return new Response(JSON.stringify({ error: body || `Upstream ${label} error`, status: res.status }), {
    status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error('Unauthorized');

    const { data: profile } = await supabase
      .from('profiles')
      .select('equipe_id')
      .eq('user_id', user.id)
      .single();
    if (!profile?.equipe_id) throw new Error('Profile not found');

    const { data: equipe } = await supabase
      .from('equipes')
      .select('gpt_maker_agent_id')
      .eq('id', profile.equipe_id)
      .single();
    if (!equipe?.gpt_maker_agent_id) throw new Error('AI Engine Agent ID not configured');

    const engineToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!engineToken) throw new Error('AI Engine token not configured');

    // IDs colados no Admin podem carregar whitespace/newline — sanitizar sempre
    const agentId = equipe.gpt_maker_agent_id.trim();
    const engineHeaders = {
      'Authorization': `Bearer ${engineToken}`,
      'Content-Type': 'application/json',
    };

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'get';

    // Onda 9 (#2): a lista vem do provedor e é cacheada em ai_model_catalog
    // (TTL 6 h); MODEL_CATALOG só dá preço e rótulo. `refresh=1` é o botão
    // "Atualizar lista".
    if (action === 'models') {
      const result = await loadModels({
        supabase, engineHeaders, agentId,
        force: url.searchParams.get('refresh') === '1',
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET — fan out to the agent object and the /settings sub-resource.
    if (req.method === 'GET' || action === 'get') {
      const [agentRes, settingsRes] = await Promise.all([
        fetch(`${AI_ENGINE_BASE}/agent/${agentId}`, { headers: engineHeaders }),
        fetch(`${AI_ENGINE_BASE}/agent/${agentId}/settings`, { headers: engineHeaders }),
      ]);

      if (!agentRes.ok)    return upstreamError(agentRes, 'agent');
      if (!settingsRes.ok) return upstreamError(settingsRes, 'settings');

      const agent = await agentRes.json();
      const s = await settingsRes.json();

      const agentOut = {
        name: agent.name ?? '',
        // ACTIVE | INACTIVE. Sprint 7.4 W2: this is the closest thing the
        // provider has to "horário de atendimento" — there is no schedule API,
        // but the agent can be silenced. Note it is AGENT-wide: inactive means
        // silent on every channel at once.
        status: agent.status ?? 'ACTIVE',
        behavior: agent.behavior ?? '',
        // T0 + provider docs: the agent object field is `jobDescription`
        // (PUT /agent/{id} accepts jobDescription, NOT description). The
        // frozen contract keeps the app-facing key `description`, so map the
        // real upstream field here — `agent.description` is always undefined.
        description: agent.jobDescription ?? '',
      };

      const settingsOut = {
        prefferModel: s.prefferModel ?? 'GPT_4_O_MINI',
        timezone: s.timezone ?? 'America/Fortaleza',
        enabledHumanTransfer: s.enabledHumanTransfer ?? false,
        enabledReminder: s.enabledReminder ?? false,
        splitMessages: s.splitMessages ?? false,
        enabledEmoji: s.enabledEmoji ?? false,
        limitSubjects: s.limitSubjects ?? false,
        signMessages: s.signMessages ?? false,
        messageGroupingTime: s.messageGroupingTime ?? 'NO_GROUP',
        maxDailyMessages: s.maxDailyMessages ?? null,
        // T0: live value is null, not a block action. Do not coerce to a
        // default — null means "no limit configured".
        maxDailyMessagesLimitAction: s.maxDailyMessagesLimitAction ?? null,
        knowledgeByFunction: s.knowledgeByFunction ?? false,
        // T0: documented but absent from the live GET. Defaulting to '' is
        // correct; never assume the provider echoes it back.
        onLackKnowLedge: s.onLackKnowLedge ?? '',
        // T0: returned live, undocumented. Surfaced so T6 can decide to expose it.
        resumeTransferHumanAI: s.resumeTransferHumanAI ?? false,
      };

      // Sprint 7.3: the legacy flat duplication (`...agentOut, ...settingsOut`)
      // is gone. It existed only to keep BehaviorSettings.tsx / SettingsPage.tsx
      // / UsagePage.tsx alive across the 7.2 wave gap. All three now read the
      // nested shape (and the first was deleted outright), so the contract is
      // just { agent, settings }.
      return new Response(JSON.stringify({
        agent: agentOut,
        settings: settingsOut,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    let updatePayload: Record<string, unknown> = {};

    if (action === 'update-behavior') {
      updatePayload = { behavior: body.behavior };
    } else if (action === 'update-description') {
      // Provider expects jobDescription on the agent object (see GET above).
      // The app-facing key is `description`; map it to the upstream field.
      updatePayload = { jobDescription: body.description };
    } else if (action === 'update-settings') {
      for (const key of SETTINGS_KEYS) if (key in body) updatePayload[key] = body[key];
      if (Object.keys(updatePayload).length === 0) {
        return new Response(JSON.stringify({ error: 'No valid settings keys provided', status: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else if (action === 'update-model') {
      // Do NOT validate against MODEL_CATALOG. T0 proved the provider runs models
      // that appear in no published enum (GPT_5_6_SOL was the live prefferModel),
      // so a closed allowlist would reject the tenant's own current model. Reject
      // only obvious garbage and let the provider be the authority.
      if (typeof body.model !== 'string' || !/^[A-Z0-9_]{2,50}$/.test(body.model)) {
        return new Response(JSON.stringify({ error: `Invalid model id: ${body.model}`, status: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      updatePayload = { prefferModel: body.model };
    } else if (action === 'set-status') {
      // Distinct upstream shape: PUT /agent/{id}/active|inactive, no body.
      // Handled inline because it does not fit the shared PUT-with-payload path.
      const next = String(body.status ?? '').toUpperCase();
      if (next !== 'ACTIVE' && next !== 'INACTIVE') {
        return new Response(JSON.stringify({ error: `Invalid status: ${body.status}`, status: 400 }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const verb = next === 'ACTIVE' ? 'active' : 'inactive';
      const statusRes = await fetch(`${AI_ENGINE_BASE}/agent/${agentId}/${verb}`, {
        method: 'PUT', headers: engineHeaders,
      });
      if (!statusRes.ok) return upstreamError(statusRes, `set-status-${verb}`);
      return new Response(JSON.stringify({ success: true, status: next }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const putRes = await fetch(upstreamFor(action, agentId), {
      method: 'PUT', headers: engineHeaders, body: JSON.stringify(updatePayload),
    });
    if (!putRes.ok) return upstreamError(putRes, action);

    const data = await putRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
