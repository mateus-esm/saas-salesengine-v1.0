export class HttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type TenantCaller = {
  equipeId: string;
  defaultTriggerSource: "lead_intake" | "http" | "manual";
  profileId: string | null;
};

/**
 * Resolve segredo do tenant, service role ou JWT de usuário, nesta ordem.
 * O segredo vem primeiro porque integrações n8n também podem mandar um bearer
 * do gateway que não identifica o tenant.
 */
export async function resolveCaller(
  req: Request,
  url: URL,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  body: Record<string, unknown>,
): Promise<TenantCaller> {
  const secret = req.headers.get("x-webhook-secret") ||
    url.searchParams.get("secret");
  if (secret) {
    const { data: team, error } = await supabase
      .from("equipes")
      .select("id")
      .eq("webhook_secret", secret)
      .maybeSingle();
    if (error) throw error;
    if (!team) {
      throw new HttpError("Segredo de webhook inválido", 401, "invalid_secret");
    }
    return { equipeId: team.id, defaultTriggerSource: "http", profileId: null };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError("Credencial ausente", 401, "unauthorized");

  if (token === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "___")) {
    const equipeId = typeof body.equipe_id === "string"
      ? body.equipe_id.trim()
      : "";
    if (!equipeId) {
      throw new HttpError(
        "equipe_id é obrigatório na chamada interna",
        400,
        "missing_equipe",
      );
    }
    return { equipeId, defaultTriggerSource: "lead_intake", profileId: null };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    token,
  );
  if (authError || !user) {
    throw new HttpError("Credencial inválida", 401, "unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, equipe_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.equipe_id) {
    throw new HttpError("Perfil sem equipe", 403, "no_team");
  }

  return {
    equipeId: profile.equipe_id,
    defaultTriggerSource: "manual",
    profileId: profile.id,
  };
}
