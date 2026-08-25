// ============================================================================
// Sprint 8.4 (Fixes 2, item 11) — the notification switchboard's write side.
//
// Most of what this does could have been six RPC calls from the browser. Three
// things could not, and they are why it exists:
//
//   * TEST SEND. "Is this instance actually connected?" can only be answered by
//     sending through it, and the whatsmiau key lives server-side.
//
//   * SEND A PROPOSAL NOW. Enqueueing is not sending: deliveries drain on the
//     dispatcher's schedule. When the founder clicks "enviar no WhatsApp" he
//     expects the client's phone to buzz, not to wait for the next cron tick.
//
//   * The dispatcher is invoked rather than reimplemented. Two code paths that
//     both "send a notification" is exactly how one of them ends up quietly
//     different from the other.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaSolo } from "../_shared/solo-sender.ts";
import { normalizePhone } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GUARDS: Record<string, { status: number; message: string }> = {
  forbidden:                 { status: 403, message: "Apenas super admin." },
  unknown_purpose:           { status: 404, message: "Finalidade desconhecida." },
  unknown_notification_type: { status: 404, message: "Tipo de notificação desconhecido." },
  unknown_setting:           { status: 404, message: "Configuração desconhecida." },
  proposal_not_found:        { status: 404, message: "Proposta não encontrada." },
  builtin_template:          { status: 409, message: "Este modelo é do sistema: há código que o dispara, e apagá-lo quebraria esse envio. Deixe-o sem canal nenhum para silenciá-lo." },
  template_already_exists:   { status: 409, message: "Já existe um modelo com esse nome." },
  invalid_channel:           { status: 400, message: "Canal inválido. Só existem no app, e-mail e WhatsApp." },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await db
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "super_admin") return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "save_sender":
        return json(await rpc(asUser, "admin_set_notification_sender", {
          p_purpose: body.purpose, p_instance: body.instance ?? null,
          p_email: body.email ?? null, p_active: body.active ?? null,
        }));

      case "save_template":
        return json(await rpc(asUser, "admin_set_notification_template", {
          p_type: body.type, p_title: body.title ?? "", p_body: body.body ?? "",
          // undefined (field absent) leaves channels alone; an array — including
          // an empty one, which means "record but never deliver" — sets them.
          p_channels: body.channels ?? null,
        }));

      case "create_template":
        return json(await rpc(asUser, "admin_create_notification_template", {
          p_type: body.type ?? null,
          p_description: body.description,
          p_purpose: body.purpose ?? "operacao",
          p_channels: body.channels ?? ["in_app"],
          p_title: body.title ?? null,
          p_body: body.body ?? null,
          p_severity: body.severity ?? "info",
        }));

      case "delete_template":
        return json(await rpc(asUser, "admin_delete_notification_template", {
          p_type: body.type,
        }));

      case "send_template":   return json(await sendTemplate(db, asUser, body));

      case "save_policy":
        return json(await rpc(asUser, "admin_set_notification_policy", {
          p_equipe_id: body.equipe_id, p_type: body.type,
          p_enabled: body.enabled ?? null, p_channels: body.channels ?? null,
          p_auto: body.auto ?? null,
          p_phone_override: body.phone_override ?? null,
          p_email_override: body.email_override ?? null,
        }));

      case "save_setting":
        return json(await rpc(asUser, "admin_set_system_setting", {
          p_key: body.key, p_value: body.value ?? "",
        }));

      case "test_send":       return json(await testSend(db, body));
      case "send_proposal":   return json(await sendProposal(db, asUser, body));

      default:
        return json({ error: "unknown_action", action }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const guard = Object.keys(GUARDS).find((k) => message.includes(k));
    if (guard) return json({ error: guard, message: GUARDS[guard].message }, GUARDS[guard].status);
    console.error(`[admin-notifications] ${action} failed:`, message);
    return json({ error: "operation_failed", message }, 500);
  }
});

async function rpc<T = unknown>(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Prove a purpose's line works, by using it.
 *
 * Deliberately does NOT create a notification row: a test is not something the
 * customer was told, and leaving test rows in the history would corrupt the one
 * record that has to stay trustworthy.
 */
async function testSend(db: SupabaseClient, body: Record<string, unknown>) {
  const { data: sender } = await db
    .from("notification_senders").select("*").eq("purpose", body.purpose).maybeSingle();
  if (!sender) throw new Error("unknown_purpose");

  const instance = sender.whatsapp_instance ?? Deno.env.get("SOLO_PLATFORM_INSTANCE_ID");
  if (!instance) return { ok: false, error: "Nenhuma instância configurada para esta finalidade." };

  // Sprint 8.5 (Fixes 3, item 13): the shared normalizer, not a digit strip.
  // Typing "85996487923" here used to send a number with no country code — the
  // API returned a message key, we reported success, and nothing arrived.
  const phone = normalizePhone(String(body.phone ?? ""));
  if (!phone) return { ok: false, error: "Informe um número válido com DDD." };

  const r = await sendViaSolo({
    supabase: db,
    equipeId: null,
    instanceName: instance,
    phone,
    content: `Teste de notificação — ${sender.label}.\n\nSe você recebeu esta mensagem, a instância "${instance}" está conectada e enviando.`,
  });

  return r.ok
    ? { ok: true, instance }
    : { ok: false, instance, error: r.error ?? "Falha desconhecida ao enviar." };
}

/**
 * Fire a template at one client, by hand.
 *
 * Sprint 8.5 (Fixes 3, item 14): a template nobody can send is dead weight, and
 * a custom type is emitted by no code at all — this is the only thing that makes
 * one useful. It goes through notify() like everything else, so the client's
 * policy still applies: a type they have switched off stays off even when the
 * send was deliberate.
 */
async function sendTemplate(db: SupabaseClient, asUser: SupabaseClient, body: Record<string, unknown>) {
  const equipeId = String(body.equipe_id ?? "");

  // What a manual template can interpolate. Read here rather than in SQL so the
  // variable list stays next to the one place that documents it.
  const { data: team } = await db
    .from("v_admin_team_billing")
    .select("nome, whatsapp_balance, copilot_balance")
    .eq("equipe_id", equipeId).maybeSingle();

  const id = await rpc<string | null>(asUser, "notify", {
    p_equipe_id: equipeId,
    p_type: body.type,
    // The template wins when there is one; these are the fallback for a type
    // whose wording was cleared.
    p_title: body.title ?? "Aviso",
    p_body: body.body ?? null,
    p_action_url: body.action_url ?? "/",
    p_data: {
      equipe_nome: team?.nome ?? "",
      saldo_whatsapp: String(team?.whatsapp_balance ?? 0),
      saldo_copilot: String(team?.copilot_balance ?? 0),
    },
    p_dedup_key: `manual_${Date.now()}`,
  });

  if (!id) {
    return { ok: false, blocked: true,
      message: "Este cliente está com esta notificação desligada nas regras dele." };
  }

  await drain(db);
  const { data: deliveries } = await db
    .from("notification_deliveries")
    .select("channel, status, last_error")
    .eq("notification_id", id);

  return { ok: true, notification_id: id, deliveries: deliveries ?? [] };
}

/**
 * "Proposta Gerada, cliente recebe a proposta no WhatsApp através do número da
 * Solo" — the flow the founder named.
 *
 * Enqueue through notify_prospect (so the message is templated, deduplicated and
 * recorded like any other) and then drain immediately, because a human is
 * watching and expects it to have happened.
 */
async function sendProposal(db: SupabaseClient, asUser: SupabaseClient, body: Record<string, unknown>) {
  const proposalId = String(body.proposal_id ?? "");

  // A fresh dedup key per deliberate send: re-sending a proposal after fixing the
  // client's number is a legitimate act, and a fixed key would swallow it.
  const dedup = (body.resend === true) ? `sent_${Date.now()}` : "sent";

  const id = await rpc<string | null>(asUser, "notify_prospect", {
    p_proposal_id: proposalId,
    p_type: "proposal.sent",
    p_data: {},
    p_dedup_key: dedup,
  });

  if (!id) {
    return { ok: false, already_sent: true,
      message: "Esta proposta já foi enviada. Use reenviar se quiser mandar de novo." };
  }

  const drained = await drain(db);

  const { data: deliveries } = await db
    .from("notification_deliveries")
    .select("channel, status, last_error")
    .eq("notification_id", id);

  return { ok: true, notification_id: id, drained, deliveries: deliveries ?? [] };
}

/**
 * Run the dispatcher now instead of waiting for its cron.
 *
 * Invoked over HTTP rather than imported: the dispatcher owns provider
 * behaviour, retries and backoff, and a second in-process copy of that logic is
 * how the two would drift apart.
 */
async function drain(_db: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const secret = Deno.env.get("BILLING_CRON_SECRET");
  const base = Deno.env.get("SUPABASE_URL");
  if (!secret || !base) {
    // The message is queued and the cron will pick it up; that is a delay, not a
    // loss, so it is reported rather than thrown.
    return { ok: false, error: "BILLING_CRON_SECRET not configured — enfileirado para o cron." };
  }
  try {
    const res = await fetch(`${base}/functions/v1/notification-dispatcher`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": secret,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
      },
      body: JSON.stringify({ limit: 20 }),
    });
    if (!res.ok) return { ok: false, error: `dispatcher ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
