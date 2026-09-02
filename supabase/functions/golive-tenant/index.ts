// ============================================================================
// Sprint 8.2 — colocar um cliente no ar.
//
// O clique que faltava. Até aqui provisionar e colocar no ar eram a mesma coisa:
// um botão criava a equipe, iniciava o trial de 15 dias e emitia a cobrança no
// mesmo instante — antes do discovery, antes do agente treinado, antes de
// existir um CRM montado. O cliente gastava o trial julgando um ambiente vazio.
//
// Agora o go-live é o momento em que ele passa a ter um produto de verdade, e é
// daqui que o relógio faz sentido.
//
// A ORDEM É DELIBERADA:
//
//   1. VALIDA A COBRANÇA ANTES DE QUALQUER COISA. Colocar no ar e só então
//      descobrir que falta o CNPJ é exatamente o que o sistema fazia — a
//      FAT-2026-000018 da Rema (R$700) está aberta sem cobrança porque o
//      documento nunca foi exigido. Aqui isso é um 409 com o campo que falta,
//      antes de o cliente ser avisado de nada.
//   2. A transação: went_live_at, trial, fatura, card para Ativo.
//   3. A cobrança no gateway.
//   4. O aviso ao cliente.
//
// Idempotente: clicar duas vezes não dá dois trials nem duas faturas.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BillingIncompleteError, checkBillingReadiness, ensureCharges } from "../_shared/billing-charges.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface GoLiveResult {
  already_live: boolean;
  equipe_id: string;
  contract_id: string;
  status: string;
  trial_ends_at: string | null;
  trial_days?: number;
  setup_invoice_id: string | null;
  setup_total?: number;
  onboarding_id: string | null;
  charge_now: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    // Colocar no ar inicia uma cobrança recorrente — só super admin.
    const { data: me } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (me?.role !== "super_admin") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as {
      contract_id?: string;
      onboarding_id?: string;
    };

    const contractId = body.contract_id ?? await contractFromOnboarding(db, body.onboarding_id);
    if (!contractId) return json({ error: "contract_id_required" }, 400);

    const { data: contract } = await db
      .from("contracts").select("equipe_id, status, went_live_at").eq("id", contractId).maybeSingle();
    if (!contract) return json({ error: "contract_not_found" }, 404);

    // --- 1. a cobrança vai funcionar? ----------------------------------------
    //
    // Antes da transação, de propósito. Um contrato que já está no ar pula esta
    // porta: a cobrança pode ter falhado por outro motivo, e travar a retentativa
    // por um documento faltante deixaria a fatura permanentemente sem cobrança.
    if (!contract.went_live_at) {
      const ready = await checkBillingReadiness(db, contract.equipe_id);
      if (!ready.ok) {
        return json({
          error: "billing_incomplete",
          missing: ready.missing,
          equipe_id: contract.equipe_id,
        }, 409);
      }
    }

    // --- 2. a transação -------------------------------------------------------
    const { data: result, error: rpcErr } = await db.rpc("go_live_contract", {
      p_contract_id: contractId,
    });
    if (rpcErr) {
      const known = ["contract_not_found", "contract_not_in_onboarding"];
      const code = known.find((k) => rpcErr.message.includes(k));
      return json({ error: code ?? rpcErr.message }, code ? 409 : 500);
    }

    const r = result as GoLiveResult;
    const warnings: string[] = [];

    // --- 3. a cobrança --------------------------------------------------------
    //
    // Não é fatal: o cliente ESTÁ no ar, e o billing-cron reemite. Falhar aqui
    // depois de a transação ter passado não pode desfazer o go-live — seria
    // tirar do ar um ambiente que já funciona por causa do gateway.
    let charged = false;
    if (r.charge_now && r.setup_invoice_id) {
      try {
        const out = await ensureCharges(db, {
          equipe_id: r.equipe_id,
          invoice_ids: [r.setup_invoice_id],
        });
        charged = out.charged.length > 0;
      } catch (e) {
        const msg = e instanceof BillingIncompleteError
          ? `faltam dados de cobrança: ${e.missing.join(", ")}`
          : e instanceof Error ? e.message : String(e);
        warnings.push(`cobrança: ${msg}`);
        console.error("[golive-tenant] gateway step failed:", msg);
      }
    }

    // --- 4. o aviso -----------------------------------------------------------
    if (!r.already_live) {
      await sendGoLive(db, r);
    }

    return json({ success: true, ...r, charged, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[golive-tenant] fatal:", message);
    return json({ error: message }, 500);
  }
});

/** O quadro manda o id do card; o contrato é o que a transação precisa. */
async function contractFromOnboarding(
  db: SupabaseClient, onboardingId?: string,
): Promise<string | null> {
  if (!onboardingId) return null;

  const { data: card } = await db
    .from("onboardings").select("equipe_id").eq("id", onboardingId).maybeSingle();
  if (!card?.equipe_id) return null;

  const { data: contract } = await db
    .from("contracts").select("id")
    .eq("equipe_id", card.equipe_id)
    .in("status", ["draft", "onboarding"])
    .maybeSingle();

  return contract?.id ?? null;
}

/**
 * "Seu Solo Rev está no ar."
 *
 * Diz o que passou a funcionar antes de falar de dinheiro — a regra de texto do
 * produto — e deixa explícito quando a assinatura começa. Um cliente que sabe a
 * data não se surpreende com a fatura.
 */
async function sendGoLive(db: SupabaseClient, r: GoLiveResult) {
  const { data: settings } = await db
    .from("system_settings").select("key, value").eq("key", "APP_BASE_URL");
  // White-label por domínio: um link global levaria o cliente para a marca de
  // outro. tenant_public_origin() resolve o domínio desta equipe.
  const { data: origin } = await db.rpc("tenant_public_origin", { p_equipe_id: r.equipe_id });

  const { data: items } = await db
    .from("contract_items").select("quantity, unit_price, period").eq("contract_id", r.contract_id);

  const monthly = (items ?? [])
    .filter((i) => i.period === "monthly")
    .reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);

  await notify(db, r.equipe_id, "onboarding.golive", "Seu ambiente está no ar", "", "/home", {
    cliente_nome: await teamName(db, r.equipe_id),
    link_app: (typeof origin === "string" && origin) || (settings ?? [])[0]?.value || "",
    trial_dias: String(r.trial_days ?? 0),
    trial_fim: formatDateBR(r.trial_ends_at),
    valor_mensal: monthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
  }, `golive_${r.contract_id}`);
}

async function teamName(db: SupabaseClient, equipeId: string): Promise<string> {
  const { data } = await db.from("equipes").select("nome").eq("id", equipeId).maybeSingle();
  return data?.nome ?? "";
}

/** dd/mm/aaaa — o cliente lê a data, não o ISO. */
function formatDateBR(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "";
}

async function notify(
  db: SupabaseClient, equipeId: string, type: string,
  title: string, body: string, actionUrl: string,
  data: Record<string, string>, dedupKey: string,
) {
  const { error } = await db.rpc("notify", {
    p_equipe_id: equipeId, p_type: type, p_title: title, p_body: body,
    p_action_url: actionUrl, p_data: data, p_dedup_key: dedupKey,
  });
  if (error) console.error(`[golive-tenant] notify(${type}):`, error.message);
}
