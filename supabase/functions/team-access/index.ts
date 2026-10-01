// ============================================================================
// SE-TEAMACCESS-001 — o dono gerencia a própria equipe.
//
// Ações (POST { action, ... }):
//   add          { email, password, full_name?, role }   cria e vincula, até o limite do plano
//   set_role     { user_id, role }                       user | admin
//   set_access   { user_id, access }                     active | restricted
//
// Quem chama: owner ou super_admin, SEMPRE na própria equipe — o equipe_id vem
// do perfil de quem chama, nunca do corpo. Não há exclusão: restringir bloqueia
// o login (ban no auth) e libera o assento, e preserva o histórico da pessoa.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import {
  checkTarget,
  highestRole,
  isAssignableRole,
  seatErrorMessage,
} from "../_shared/team-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Ban "para sempre" do GoTrue; 'none' remove.
const BAN_FOREVER = "876000h";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error("Supabase env vars not configured");
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Autoriza: owner/super_admin, na equipe do próprio perfil.
    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const callerRole = highestRole((callerRoles ?? []).map((r) => r.role as string));
    if (callerRole !== "owner" && callerRole !== "super_admin") {
      return json({ error: "Somente o dono da equipe pode gerenciar usuários" }, 403);
    }

    const { data: callerProfile } = await admin
      .from("profiles").select("equipe_id").eq("user_id", caller.id).maybeSingle();
    const equipeId = callerProfile?.equipe_id as string | undefined;
    if (!equipeId) return json({ error: "Perfil sem equipe" }, 403);

    const body = await req.json() as Record<string, unknown>;
    const action = body.action;

    // 2. Ações ---------------------------------------------------------------

    if (action === "add") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim() || null;
      const role = body.role ?? "user";

      if (!email || !email.includes("@")) return json({ error: "E-mail inválido" }, 400);
      if (password.length < 8) return json({ error: "A senha precisa de ao menos 8 caracteres" }, 400);
      if (!isAssignableRole(role)) return json({ error: "Papel inválido" }, 400);

      // Pré-checagem para a mensagem ser clara e nada ser criado à toa; o
      // trigger de profiles continua sendo a barreira de verdade.
      const { data: usage } = await admin.rpc("tenant_seat_usage", { p_equipe_id: equipeId });
      if (usage && usage.can_add === false) {
        return json({
          error: seatErrorMessage("seat_limit_reached"),
          code: "seat_limit_reached",
          seats: usage,
        }, 409);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (createErr || !created?.user) {
        const msg = createErr?.message ?? "Erro ao criar usuário";
        return json({ error: msg }, /already|registered/i.test(msg) ? 409 : 400);
      }
      const newId = created.user.id;

      const { error: profErr } = await admin.from("profiles")
        .update({ equipe_id: equipeId, nome_completo: fullName, role })
        .eq("user_id", newId);
      if (profErr) {
        await admin.auth.admin.deleteUser(newId);
        const seat = seatErrorMessage(profErr.message);
        if (seat) return json({ error: seat, code: "seat_limit_reached" }, 409);
        console.error("[team-access] profile update failed:", profErr);
        return json({ error: "Falha ao vincular usuário à equipe" }, 500);
      }

      const { error: roleErr } = await admin.from("user_roles").insert({ user_id: newId, role });
      if (roleErr) {
        await admin.auth.admin.deleteUser(newId);
        console.error("[team-access] role insert failed:", roleErr);
        return json({ error: "Falha ao atribuir papel" }, 500);
      }

      return json({ user_id: newId, email, role });
    }

    if (action === "set_role" || action === "set_access") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id é obrigatório" }, 400);

      const { data: target } = await admin.from("profiles")
        .select("user_id, equipe_id, access_status").eq("user_id", targetId).maybeSingle();
      // "Não existe" e "é de outra equipe" respondem igual: não vazar a existência.
      if (!target || target.equipe_id !== equipeId) {
        return json({ error: "Usuário não encontrado na sua equipe" }, 404);
      }

      const { data: targetRoles } = await admin
        .from("user_roles").select("role").eq("user_id", targetId);
      const targetRole = highestRole((targetRoles ?? []).map((r) => r.role as string));
      const check = checkTarget(caller.id, targetId, targetRole);
      if (!check.ok) return json({ error: check.error }, check.status);

      if (action === "set_role") {
        const role = body.role;
        if (!isAssignableRole(role)) return json({ error: "Papel inválido" }, 400);

        // user_roles é o que a UI lê; profiles.role é o que o RLS lê. Os dois.
        if ((targetRoles ?? []).length > 0) {
          const { error } = await admin.from("user_roles").update({ role }).eq("user_id", targetId);
          if (error) throw error;
        } else {
          const { error } = await admin.from("user_roles").insert({ user_id: targetId, role });
          if (error) throw error;
        }
        const { error: pErr } = await admin.from("profiles").update({ role }).eq("user_id", targetId);
        if (pErr) throw pErr;
        return json({ user_id: targetId, role });
      }

      // set_access
      const access = body.access;
      if (access !== "active" && access !== "restricted") {
        return json({ error: "Acesso inválido" }, 400);
      }
      if (target.access_status === access) return json({ user_id: targetId, access });

      const now = new Date().toISOString();

      if (access === "restricted") {
        // Ban primeiro: se falhar, o perfil não mente dizendo que está restrito.
        const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
          ban_duration: BAN_FOREVER,
        });
        if (banErr) throw banErr;
        const { error } = await admin.from("profiles")
          .update({ access_status: "restricted", access_changed_at: now })
          .eq("user_id", targetId);
        if (error) throw error;
        return json({ user_id: targetId, access });
      }

      // Reativar volta a ocupar assento: o trigger decide.
      const { error } = await admin.from("profiles")
        .update({ access_status: "active", access_changed_at: now })
        .eq("user_id", targetId);
      if (error) {
        const seat = seatErrorMessage(error.message);
        if (seat) return json({ error: seat, code: "seat_limit_reached" }, 409);
        throw error;
      }
      const { error: unbanErr } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "none",
      });
      if (unbanErr) {
        // Desfaz: ativo no perfil e banido no auth seria um assento pago sem login.
        await admin.from("profiles")
          .update({ access_status: "restricted" }).eq("user_id", targetId);
        throw unbanErr;
      }
      return json({ user_id: targetId, access });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    console.error("[team-access] unhandled:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
