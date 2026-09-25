// deno-lint-ignore-file no-import-prefix no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateEntryIds,
  validateProfileInput,
  validateSteps,
} from "../_shared/outreach/api-validation.ts";
import { listEngineChannels } from "../_shared/outreach/gptmaker.ts";
import { HttpError, resolveCaller } from "../_shared/tenant-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // `x-client-info` é obrigatório: o supabase-js o envia em toda chamada
  // (functions-js DEFAULT_HEADERS). Sem ele no Allow-Headers o preflight do
  // browser falha e o fetch morre antes de sair — o usuário vê
  // "Failed to send a request to the Edge Function". Todas as outras funções
  // do repo já listam este header.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const caller = await resolveCaller(req, new URL(req.url), supabase, body);
    const action = text(body.action);

    if (action === "enroll") {
      const sequenceId = text(body.sequence_id);
      let leadId = text(body.lead_id);
      if (!leadId && text(body.phone)) {
        const { data, error } = await supabase.rpc("crm_find_lead_by_phone", {
          p_equipe_id: caller.equipeId,
          p_phone: text(body.phone),
        });
        if (error) throw error;
        leadId = data ?? "";
      }
      if (!sequenceId || !leadId) {
        throw new HttpError("sequence_id e lead_id/phone são obrigatórios");
      }
      const { data, error } = await supabase.rpc("crm_outreach_enroll", {
        p_equipe_id: caller.equipeId,
        p_sequence_id: sequenceId,
        p_lead_id: leadId,
        p_event_key: text(body.event_key) || null,
      });
      if (error) throw error;
      return json(data, 200);
    }

    if (action === "cancel") {
      const { data, error } = await supabase.rpc("crm_outreach_cancel", {
        p_equipe_id: caller.equipeId,
        p_enrollment_id: text(body.enrollment_id) || null,
        p_lead_id: text(body.lead_id) || null,
        p_sequence_id: text(body.sequence_id) || null,
        p_reason: "manual",
      });
      if (error) throw error;
      return json({ cancelled: data ?? 0 });
    }

    if (action === "opt-out") {
      let phone = text(body.phone);
      const leadId = text(body.lead_id) || null;
      if (!phone && leadId) {
        const { data: lead, error } = await supabase.from("leads")
          .select("phone, equipe_id").eq("id", leadId).maybeSingle();
        if (error) throw error;
        if (!lead || lead.equipe_id !== caller.equipeId) {
          throw new HttpError("Lead não encontrado", 404);
        }
        phone = lead.phone ?? "";
      }
      const { data, error } = await supabase.rpc("crm_outreach_opt_out", {
        p_equipe_id: caller.equipeId,
        p_phone: phone,
        p_lead_id: leadId,
        p_reason: caller.profileId ? "manual" : "api",
      });
      if (error) throw error;
      return json(data);
    }

    if (action === "list-sequences") {
      const [
        sequencesResult,
        stepsResult,
        enrollmentsResult,
        entriesResult,
        instancesResult,
        profileResult,
        teamResult,
      ] = await Promise.all([
        supabase.from("cadence_sequences").select("*").eq(
          "equipe_id",
          caller.equipeId,
        ).order("created_at"),
        supabase.from("cadence_steps").select("*").eq(
          "equipe_id",
          caller.equipeId,
        ).order("position"),
        supabase.from("cadence_enrollments").select("sequence_id, status").eq(
          "equipe_id",
          caller.equipeId,
        ),
        supabase.from("crm_entries").select("id, name, kind, active").eq(
          "equipe_id",
          caller.equipeId,
        )
          .in("kind", ["webhook", "import", "manual"]).eq("active", true).order(
            "name",
          ),
        supabase.from("wpp_instances").select(
          "id, instance_name, display_name, status",
        )
          .eq("equipe_id", caller.equipeId).order("display_name"),
        supabase.from("conversation_opener_settings").select("*").eq(
          "equipe_id",
          caller.equipeId,
        ).maybeSingle(),
        supabase.from("equipes").select("workspace_id, gpt_maker_agent_id").eq(
          "id",
          caller.equipeId,
        ).single(),
      ]);
      for (
        const result of [
          sequencesResult,
          stepsResult,
          enrollmentsResult,
          entriesResult,
          instancesResult,
          profileResult,
          teamResult,
        ]
      ) {
        if (result.error) throw result.error;
      }
      const counts: Record<string, Record<string, number>> = {};
      for (const enrollment of enrollmentsResult.data ?? []) {
        counts[enrollment.sequence_id] ??= {};
        counts[enrollment.sequence_id][enrollment.status] =
          (counts[enrollment.sequence_id][enrollment.status] ?? 0) + 1;
      }
      const token = Deno.env.get("GPT_MAKER_TOKEN") ?? "";
      const workspaceId = text(teamResult.data?.workspace_id);
      const agentId = text(teamResult.data?.gpt_maker_agent_id);
      let gptChannels: unknown[] = [];
      let gptChannelsError: string | null = null;
      if (token && workspaceId && agentId) {
        const listed = await listEngineChannels({
          token,
          workspaceId,
          agentId,
        });
        if ("channels" in listed) gptChannels = listed.channels;
        else gptChannelsError = listed.errorCode;
      } else {
        gptChannelsError = "gptmaker_not_configured";
      }
      return json({
        sequences: (sequencesResult.data ?? []).map((sequence) => ({
          ...sequence,
          steps: (stepsResult.data ?? []).filter((step) =>
            step.sequence_id === sequence.id && step.active
          ),
          enrollment_counts: counts[sequence.id] ?? {},
        })),
        entries: entriesResult.data ?? [],
        solo_instances: instancesResult.data ?? [],
        gpt_channels: gptChannels,
        gpt_channels_error: gptChannelsError,
        profile: profileResult.data ?? {
          provider: "gptmaker",
          channel_id: null,
          solo_instance_id: null,
          send_window_start: "08:00",
          send_window_end: "20:00",
          timezone: "America/Sao_Paulo",
          max_sends_per_line_hour: 30,
          opt_out_keywords: [
            "sair",
            "parar",
            "pare",
            "stop",
            "cancelar",
            "descadastrar",
          ],
        },
      });
    }

    if (action === "upsert-sequence") {
      if (!caller.profileId) {
        throw new HttpError("Só usuário autenticado altera sequências", 403);
      }
      const sequence = (body.sequence ?? {}) as Record<string, any>;
      const sequenceId = text(sequence.id);
      const name = text(sequence.name);
      if (!name) throw new HttpError("Nome da sequência é obrigatório");
      const triggerEvent = sequence.trigger_event === "stage_entered"
        ? "stage_entered"
        : "lead_intake";
      const requestedEntries = Array.isArray(sequence.trigger_entry_ids)
        ? sequence.trigger_entry_ids
        : [];
      const { data: allEntries, error: entriesError } = requestedEntries.length
        ? await supabase.from("crm_entries").select("id, equipe_id, kind").in(
          "id",
          requestedEntries,
        )
        : { data: [], error: null };
      if (entriesError) throw entriesError;
      let entryIds: string[];
      try {
        entryIds = validateEntryIds(
          requestedEntries,
          allEntries ?? [],
          caller.equipeId,
        );
      } catch (error) {
        throw new HttpError(
          error instanceof Error ? error.message : String(error),
        );
      }
      const stageId = text(sequence.trigger_stage_id) || null;
      if (triggerEvent === "stage_entered") {
        const { data: stage, error } = await supabase.from("pipeline_stages_v2")
          .select("id, equipe_id").eq("id", stageId).maybeSingle();
        if (error) throw error;
        if (!stage || stage.equipe_id !== caller.equipeId) {
          throw new HttpError("Etapa inexistente neste time");
        }
      }
      let steps;
      try {
        steps = validateSteps(body.steps);
      } catch (error) {
        throw new HttpError(
          error instanceof Error ? error.message : String(error),
        );
      }
      if (sequenceId) {
        const { data: existing, error } = await supabase.from(
          "cadence_sequences",
        )
          .select("id, equipe_id").eq("id", sequenceId).maybeSingle();
        if (error) throw error;
        if (!existing || existing.equipe_id !== caller.equipeId) {
          throw new HttpError("Sequência inexistente neste time", 404);
        }
      }
      const row = {
        ...(sequenceId ? { id: sequenceId } : {}),
        equipe_id: caller.equipeId,
        name,
        active: sequence.active === true,
        trigger_event: triggerEvent,
        trigger_entry_ids: triggerEvent === "lead_intake" ? entryIds : [],
        trigger_stage_id: triggerEvent === "stage_entered" ? stageId : null,
        reenroll: sequence.reenroll === "per_event"
          ? "per_event"
          : "once_per_lead",
        stop_on_reply: sequence.stop_on_reply !== false,
        stop_on_stage_change: sequence.stop_on_stage_change !== false,
      };
      const { data: saved, error: saveError } = await supabase.from(
        "cadence_sequences",
      )
        .upsert(row).select("*").single();
      if (saveError) throw saveError;
      const { data: existingSteps, error: existingStepsError } = await supabase
        .from("cadence_steps")
        .select("id, position").eq("sequence_id", saved.id);
      if (existingStepsError) throw existingStepsError;
      const { data: savedSteps, error: stepsError } = await supabase.from(
        "cadence_steps",
      ).upsert(
        steps.map((step) => ({
          ...step,
          sequence_id: saved.id,
          equipe_id: caller.equipeId,
          active: true,
        })),
        { onConflict: "sequence_id,position" },
      ).select("*");
      if (stepsError) throw stepsError;
      const kept = new Set(steps.map((step) => step.position));
      const removed = (existingSteps ?? []).filter((step) =>
        !kept.has(step.position)
      ).map((step) => step.id);
      if (removed.length) {
        const { error } = await supabase.from("cadence_steps").update({
          active: false,
        }).in("id", removed);
        if (error) throw error;
      }
      return json({ sequence: { ...saved, steps: savedSteps ?? [] } });
    }

    if (action === "update-profile") {
      if (!caller.profileId) {
        throw new HttpError("Só usuário autenticado altera o perfil", 403);
      }
      let profile;
      try {
        profile = validateProfileInput(body.profile ?? body);
      } catch (error) {
        throw new HttpError(
          error instanceof Error ? error.message : String(error),
        );
      }
      if (profile.solo_instance_id) {
        const { data: instance, error } = await supabase.from("wpp_instances")
          .select("id, equipe_id").eq("id", profile.solo_instance_id)
          .maybeSingle();
        if (error) throw error;
        if (!instance || instance.equipe_id !== caller.equipeId) {
          throw new HttpError("Instância Solo inexistente neste time");
        }
      }
      const { data, error } = await supabase.from(
        "conversation_opener_settings",
      )
        .upsert({ equipe_id: caller.equipeId, ...profile }, {
          onConflict: "equipe_id",
        }).select("*").single();
      if (error) throw error;
      return json({ profile: data });
    }

    if (action === "get-trace") {
      const leadId = text(body.lead_id);
      const { data: lead, error: leadError } = await supabase.from("leads")
        .select("id, equipe_id").eq("id", leadId).maybeSingle();
      if (leadError) throw leadError;
      if (!lead || lead.equipe_id !== caller.equipeId) {
        throw new HttpError("Lead não encontrado", 404);
      }
      const { data: enrollments, error } = await supabase.from(
        "cadence_enrollments",
      )
        .select("*, outreach_jobs(*)").eq("equipe_id", caller.equipeId).eq(
          "lead_id",
          leadId,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ lead_id: leadId, enrollments: enrollments ?? [] });
    }

    throw new HttpError("Ação de outreach inválida", 400, "invalid_action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    console.error("[outreach]", error);
    return json({
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof HttpError ? error.code : "internal_error",
    }, status);
  }
});
