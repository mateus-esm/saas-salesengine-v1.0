// ============================================================================
// Sprint 8 · T9 — provisionar um ambiente a partir de uma proposta aceita.
// Sprint 8.2 — provisionar deixou de ser colocar no ar.
//
// O que este clique faz AGORA: o ambiente passa a existir, o cliente ganha
// acesso e recebe as boas-vindas com o link para agendar o discovery. O
// compromisso financeiro fica visível (a fatura de implantação é emitida,
// vencendo na data prevista de conclusão), mas o relógio do trial não corre e a
// mensalidade não é cobrada.
//
// O que ele NÃO faz mais: iniciar o trial, e dizer ao cliente que a primeira
// fatura está disponível. Isso é o go-live, que é um clique separado — o
// momento em que o cliente realmente tem um produto: agente treinado, canais
// conectados, CRM montado.
//
// A ORDEM IMPORTA — banco primeiro, chamadas externas depois:
//   1. provision_tenant_from_proposal() faz equipe + conta + contrato + itens +
//      fatura + card do onboarding numa transação só. Ou existe tudo, ou nada.
//   2. Cobrança no gateway, que não dá para desfazer, e SÓ quando o negócio
//      combinou pagamento adiantado (setup_charge_timing = 'on_accept').
//   3. O convite de acesso por último, porque é o mais provável de falhar
//      (e-mail errado) e o menos danoso de repetir.
//
// Reexecutar com o mesmo proposal_id RETOMA: a função SQL devolve os ids que já
// existem em vez de duplicar, e cada passo externo é pulado se já aconteceu. É
// o que torna seguro consertar um provisionamento pela metade clicando de novo.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BillingIncompleteError, ensureCharges } from "../_shared/billing-charges.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface ProvisionResult {
  already_provisioned: boolean;
  attached: boolean;
  equipe_id: string;
  contract_id: string;
  setup_invoice_id: string | null;
  onboarding_id: string | null;
  golive_previsto: string | null;
  charge_now: boolean;
  monthly_total?: number;
  setup_total?: number;
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

    // Provisionar cria um cliente faturável — só super admin.
    const { data: me } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (me?.role !== "super_admin") return json({ error: "forbidden" }, 403);

    const { proposal_id, golive_previsto } = await req.json().catch(() => ({})) as {
      proposal_id?: string;
      golive_previsto?: string;
    };
    if (!proposal_id) return json({ error: "proposal_id_required" }, 400);

    // --- 1. a parte atômica --------------------------------------------------
    const { data: result, error: provErr } = await db.rpc("provision_tenant_from_proposal", {
      p_proposal_id: proposal_id,
      p_golive_previsto: golive_previsto ?? null,
    });
    if (provErr) {
      const known = [
        "proposal_not_found",
        "proposal_not_accepted",
        "target_equipe_not_found",
        // A proposta aponta para uma equipe que já tem contrato vivo. Provisionar
        // assim mesmo cobraria o cliente duas vezes.
        "equipe_has_live_contract",
      ];
      const code = known.find((k) => provErr.message.includes(k));
      return json({ error: code ?? provErr.message }, code ? 409 : 500);
    }

    const r = result as ProvisionResult;
    const warnings: string[] = [];

    const { data: proposal } = await db
      .from("proposals")
      .select("cliente_nome, cliente_email, cliente_whatsapp, setup_charge_timing")
      .eq("id", proposal_id).maybeSingle();

    // --- 2. gateway, SÓ se o pagamento é adiantado ---------------------------
    //
    // Com 'on_golive' a fatura existe e a cobrança espera o clique de "Colocar
    // no ar". Cobrar aqui entregaria um boleto antes da reunião de discovery.
    //
    // Não é fatal: o ambiente e a fatura existem. O billing-cron anula uma
    // fatura sem cobrança depois de 2h e a próxima tentativa a reemite, então
    // uma queda do gateway atrasa a cobrança em vez de corromper o faturamento.
    let charged = false;
    if (r.charge_now && r.setup_invoice_id) {
      try {
        const out = await ensureCharges(db, {
          equipe_id: r.equipe_id,
          invoice_ids: [r.setup_invoice_id],
          due_date: r.golive_previsto,
        });
        charged = out.charged.length > 0;
      } catch (e) {
        const msg = e instanceof BillingIncompleteError
          // A causa concreta, não "erro no gateway": é isto que diz ao fundador
          // qual campo preencher antes de tentar de novo.
          ? `faltam dados de cobrança: ${e.missing.join(", ")}`
          : e instanceof Error ? e.message : String(e);
        warnings.push(`cobrança: ${msg}`);
        console.error("[provision-tenant] gateway step failed:", msg);
      }
    }

    // --- 3. o convite, por último --------------------------------------------
    let invited = false;
    if (proposal?.cliente_email) {
      try {
        invited = await ensureInvite(db, proposal.cliente_email, r.equipe_id, proposal.cliente_nome);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`convite: ${msg}`);
        // Marca no contrato para que um ambiente pela metade fique visível no
        // painel em vez de parecer completo.
        await db.from("contracts").update({
          notes: `[${new Date().toISOString()}] convite de acesso falhou: ${msg}`,
        }).eq("id", r.contract_id);
      }
    } else {
      warnings.push("convite: a proposta não tem e-mail do cliente");
    }

    // --- 4. boas-vindas -------------------------------------------------------
    //
    // Substitui o antigo `tenant.provisioned`, cujo corpo era "A primeira fatura
    // já está disponível em Faturamento" — cobrança como primeira frase depois
    // da assinatura, antes de o cliente ter tido o discovery ou visto o agente.
    //
    // Só sai num provisionamento novo: reexecutar para consertar um convite não
    // deve mandar boas-vindas de novo a quem já as recebeu.
    if (!r.already_provisioned) {
      await sendWelcome(db, r, proposal?.cliente_nome ?? "");
    }

    return json({ success: true, ...r, invited, charged, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[provision-tenant] fatal:", message);
    return json({ error: message }, 500);
  }
});

/**
 * Boas-vindas com o link do discovery.
 *
 * O texto vem do template editável em notification_types; o que esta função faz
 * é montar as variáveis. O link de agendamento sai de system_settings porque
 * uma URL de agenda muda mais do que o código.
 */
async function sendWelcome(db: SupabaseClient, r: ProvisionResult, clienteNome: string) {
  const { data: settings } = await db
    .from("system_settings").select("key, value")
    .in("key", ["ONBOARDING_CALENDLY_URL", "APP_BASE_URL"]);

  const get = (k: string) => (settings ?? []).find((s) => s.key === k)?.value ?? "";

  await notify(db, r.equipe_id, "onboarding.welcome", "Bem-vindo!", "", "/home", {
    cliente_nome: clienteNome,
    link_agenda: get("ONBOARDING_CALENDLY_URL"),
    link_app: await appOrigin(db, r.equipe_id, get("APP_BASE_URL")),
    golive_previsto: formatDateBR(r.golive_previsto),
  }, `welcome_${r.contract_id}`);
}

/**
 * O endereço do app PARA ESTE CLIENTE.
 *
 * O produto é white-label por domínio: o cliente da Rema entra por
 * rema.soloventures.com.br, o da Casa Flow por outro. Um APP_BASE_URL global
 * mandaria a pessoa para a marca de outro cliente logo na mensagem de
 * boas-vindas — que é o primeiro contato depois de assinar.
 *
 * `tenant_public_origin()` (sprint 9) já resolve isso e cai no domínio
 * institucional quando a equipe não tem nicho. O ajuste manual é o último
 * recurso, e uma string vazia é melhor que um link errado: o template some com
 * a variável em vez de mostrar um endereço de outra marca.
 */
async function appOrigin(db: SupabaseClient, equipeId: string, fallback: string): Promise<string> {
  const { data } = await db.rpc("tenant_public_origin", { p_equipe_id: equipeId });
  return (typeof data === "string" && data) || fallback || "";
}

/** dd/mm/aaaa — o cliente lê a data, não o ISO. */
function formatDateBR(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "";
}

/** Convida o cliente e prende o perfil dele à equipe. */
async function ensureInvite(
  db: SupabaseClient, email: string, equipeId: string, nome: string | null,
): Promise<boolean> {
  // Uma reexecução não pode reconvidar quem já aceitou.
  const { data: existing } = await db
    .from("profiles").select("user_id, equipe_id").eq("email", email).maybeSingle();

  if (existing) {
    if (existing.equipe_id !== equipeId) {
      await db.from("profiles")
        .update({ equipe_id: equipeId, cargo: "owner", role: "owner" })
        .eq("user_id", existing.user_id);
    }
    return true;
  }

  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { nome_completo: nome ?? undefined, equipe_id: equipeId },
  });
  if (error) throw new Error(error.message);

  // handle_new_user() cria a linha de profile; aqui ela é ligada à equipe.
  if (data?.user?.id) {
    await db.from("profiles").update({
      equipe_id: equipeId, cargo: "owner", role: "owner", nome_completo: nome ?? null,
    }).eq("user_id", data.user.id);
  }
  return true;
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
  if (error) console.error(`[provision-tenant] notify(${type}):`, error.message);
}
