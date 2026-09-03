// ============================================================================
// Sprint 8.2 — o que acontece DEPOIS de provision_tenant_from_proposal():
// cobrar (se for o caso), convidar o cliente para o login, e mandar as
// boas-vindas com o link do discovery.
//
// Extraído de provision-tenant/index.ts porque, a partir desta sprint, dois
// chamadores precisam exatamente do mesmo comportamento:
//
//   * o botão "Provisionar" do painel (provision-tenant/index.ts) — o caminho
//     manual, usado para reexecutar um provisionamento que falhou pela metade;
//   * o próprio aceite da proposta (public-proposal/index.ts) — o aceite JÁ
//     provisiona agora, para que o cliente ganhe acesso e a mensagem de
//     boas-vindas na hora, sem esperar um clique no painel.
//
// Duas cópias desta lógica é exatamente como uma delas ficaria com um convite
// que o outro caminho manda e o outro não — a mesma lição que Sprint 8.3 já
// registrou para "fatura paga" em invoice-effects.ts.
// ============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BillingIncompleteError, ensureCharges } from "./billing-charges.ts";

export interface ProvisionResult {
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

export interface ProvisionEffectsOutcome {
  charged: boolean;
  invited: boolean;
  warnings: string[];
}

/**
 * Cobra (se for o caso), convida e manda boas-vindas. Roda sempre com a
 * service role — quem chama já validou o que precisava validar antes disto.
 */
export async function runProvisionEffects(
  db: SupabaseClient,
  r: ProvisionResult,
  proposal: { cliente_nome: string | null; cliente_email: string | null },
): Promise<ProvisionEffectsOutcome> {
  const warnings: string[] = [];

  // --- cobrança, SÓ se o pagamento é adiantado --------------------------------
  //
  // Com 'on_golive' a fatura existe e a cobrança espera o clique de "Colocar no
  // ar". Cobrar aqui entregaria um boleto antes da reunião de discovery.
  //
  // Não é fatal: o ambiente e a fatura existem. O billing-cron anula uma fatura
  // sem cobrança depois de 2h e a próxima tentativa a reemite, então uma queda
  // do gateway atrasa a cobrança em vez de corromper o faturamento.
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
      console.error("[provision-effects] gateway step failed:", msg);
    }
  }

  // O endereço do app PARA ESTE CLIENTE, resolvido uma vez: o convite precisa
  // dele para saber onde devolver a pessoa depois de clicar no e-mail, e as
  // boas-vindas precisam dele para montar o link de definir senha. Duas
  // resoluções separadas poderiam divergir e mandar a pessoa para marcas
  // diferentes em cada mensagem.
  const origin = await appOrigin(db, r.equipe_id);
  const linkSenha = origin ? `${origin}/definir-senha` : "";

  // --- o convite, por último --------------------------------------------------
  let invited = false;
  if (proposal.cliente_email) {
    try {
      invited = await ensureInvite(db, proposal.cliente_email, r.equipe_id, proposal.cliente_nome, linkSenha);
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

  // --- boas-vindas -------------------------------------------------------------
  //
  // Substitui o antigo `tenant.provisioned`, cujo corpo era "A primeira fatura
  // já está disponível em Faturamento" — cobrança como primeira frase depois da
  // assinatura, antes de o cliente ter tido o discovery ou visto o agente.
  //
  // Só sai num provisionamento novo: reexecutar para consertar um convite não
  // deve mandar boas-vindas de novo a quem já as recebeu.
  if (!r.already_provisioned) {
    await sendWelcome(db, r, proposal.cliente_nome ?? "", origin, linkSenha);
  }

  return { charged, invited, warnings };
}

/**
 * Boas-vindas: entrar no sistema, depois agendar o discovery.
 *
 * O texto vem do template editável em notification_types; o que esta função faz
 * é montar as variáveis. O link de agendamento sai de system_settings porque
 * uma URL de agenda muda mais do que o código.
 *
 * `link_senha` existe porque "o acesso foi enviado para o seu e-mail" deixava o
 * cliente parado: a mensagem chega no WhatsApp e o e-mail pode estar no spam,
 * ou não ter saído. Com o link, o próximo passo está na mão dele.
 */
async function sendWelcome(
  db: SupabaseClient, r: ProvisionResult, clienteNome: string,
  origin: string, linkSenha: string,
) {
  const { data: settings } = await db
    .from("system_settings").select("key, value")
    .in("key", ["ONBOARDING_CALENDLY_URL", "APP_BASE_URL"]);

  const get = (k: string) => (settings ?? []).find((s) => s.key === k)?.value ?? "";
  const base = origin || get("APP_BASE_URL") || "";

  await notify(db, r.equipe_id, "onboarding.welcome", "Bem-vindo!", "", "/home", {
    cliente_nome: clienteNome,
    link_agenda: get("ONBOARDING_CALENDLY_URL"),
    link_app: base,
    link_senha: linkSenha || (base ? `${base}/definir-senha` : ""),
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
 * institucional quando a equipe não tem nicho — e desde esta sprint, uma
 * equipe nova herda o nicho da proposta que a criou (ver
 * provision_tenant_from_proposal). O ajuste manual é o último recurso, e uma
 * string vazia é melhor que um link errado: o template some com a variável em
 * vez de mostrar um endereço de outra marca.
 */
async function appOrigin(db: SupabaseClient, equipeId: string): Promise<string> {
  const { data } = await db.rpc("tenant_public_origin", { p_equipe_id: equipeId });
  return (typeof data === "string" && data) || "";
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
  redirectTo: string,
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
    // Sem isto o convite volta para a Site URL global do projeto — o domínio de
    // outra marca, num produto white-label — e cai numa tela de login onde a
    // pessoa ainda não tem senha. /definir-senha consome o token do link e pede
    // a senha, que é o que o convite deveria ter feito desde sempre.
    ...(redirectTo ? { redirectTo } : {}),
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
  if (error) console.error(`[provision-effects] notify(${type}):`, error.message);
}
