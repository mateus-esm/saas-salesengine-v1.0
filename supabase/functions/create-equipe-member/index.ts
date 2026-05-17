// ============================================================================
// Sprint 5.5 EPIC 4 — Direct admin-create flow for team members.
//
// Admin types email + password + role; this function creates the auth user,
// links them to the equipe, and assigns the role. No email invite, no
// invitations table — operator hands the temp password to the new teammate
// out-of-band. The new user is expected to change it on first login.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AppRole = "user" | "admin" | "owner" | "super_admin";

const ALLOWED_ROLES: AppRole[] = ["user", "admin", "owner", "super_admin"];

interface CreateMemberPayload {
  email?: string;
  password?: string;
  full_name?: string;
  equipe_id?: string;
  role?: AppRole;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error("Supabase env vars not configured");
    }

    // 1. Verify caller JWT via anon client + Authorization header
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });

    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 2. Parse + validate body
    const body = (await req.json()) as CreateMemberPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const fullName = body.full_name?.trim() || null;
    const equipeId = body.equipe_id;
    const role: AppRole = (body.role ?? "user") as AppRole;

    if (!email || !password || !equipeId) {
      return jsonResponse(
        { error: "email, password and equipe_id are required" },
        400,
      );
    }
    if (password.length < 8) {
      return jsonResponse(
        { error: "Password must be at least 8 characters" },
        400,
      );
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ error: "Invalid role" }, 400);
    }

    // 3. Authorize caller: must be admin/owner/super_admin AND (if not super_admin)
    //    must belong to the same equipe.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoleSet = new Set((callerRoles ?? []).map((r) => r.role as AppRole));
    const isSuperAdmin = callerRoleSet.has("super_admin");
    const isEquipeAdmin =
      callerRoleSet.has("admin") || callerRoleSet.has("owner");

    if (!isSuperAdmin && !isEquipeAdmin) {
      return jsonResponse({ error: "Forbidden: insufficient role" }, 403);
    }

    if (!isSuperAdmin) {
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("equipe_id")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (callerProfile?.equipe_id !== equipeId) {
        return jsonResponse(
          { error: "Forbidden: cannot manage other equipes" },
          403,
        );
      }
      // Non-super-admins cannot grant super_admin.
      if (role === "super_admin") {
        return jsonResponse(
          { error: "Forbidden: cannot grant super_admin" },
          403,
        );
      }
    }

    // 4. Create auth user (service role)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "Unknown error";
      const status = /already/i.test(msg) ? 409 : 400;
      return jsonResponse({ error: msg }, status);
    }

    const newUserId = created.user.id;

    // 5. The handle_new_user trigger already inserted profiles(id, user_id, email).
    //    Update equipe_id + nome_completo.
    const { error: profErr } = await admin
      .from("profiles")
      .update({ equipe_id: equipeId, nome_completo: fullName })
      .eq("user_id", newUserId);

    if (profErr) {
      console.error("[create-equipe-member] profile update failed:", profErr);
      // Best-effort cleanup so the orphan user isn't left in auth
      await admin.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: "Failed to link user to equipe" }, 500);
    }

    // 6. Insert user_roles row
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: newUserId, role });

    if (roleErr) {
      console.error("[create-equipe-member] role insert failed:", roleErr);
      await admin.auth.admin.deleteUser(newUserId);
      return jsonResponse({ error: "Failed to assign role" }, 500);
    }

    return jsonResponse({
      user_id: newUserId,
      email,
      equipe_id: equipeId,
      role,
    });
  } catch (err) {
    console.error("[create-equipe-member] unhandled:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
