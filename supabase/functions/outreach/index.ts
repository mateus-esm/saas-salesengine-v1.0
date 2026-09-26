// deno-lint-ignore-file no-import-prefix no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateEntryIds,
  validateProfileInput,
  validateSteps,
} from "../_shared/outreach/api-validation.ts";
import {
  classifyEntries,
  ENTRY_SELECT,
  type EntryRow,
  ineligibleEntryIds,
  loadTeamEntries,
} from "../_shared/outreach/entries.ts";
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
        // SE-REV-005 — todas as portas do time; classifyEntries() decide quais
        // aparecem (ativa, tipo que abre conversa, webhook ainda existente).
        supabase.from("crm_entries").select(ENTRY_SELECT).eq(
          "equipe_id",
          caller.equipeId,
        ).order("name"),
        supabase.from("wpp_instances").select(
          "id, instance_name, display_name, status",
        )
          .eq("equipe_id", caller.equipeId).order("display_name"),
        supabase.from("conversation_opener_settings").select("*").eq(
          "equipe_id",
          caller.equipeId,
        ).maybeSingle(),
        supabase.from("equipes").select(
          "nome, workspace_id, gpt_maker_agent_id",
        ).eq(
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
      const { entries, hidden } = classifyEntries(
        (entriesResult.data ?? []) as EntryRow[],
        caller.equipeId,
      );
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
        entries,
        // Portas que existem mas não recebem lead (webhook apagado/inativo,
        // porta desativada) — a tela avisa em vez de sumir com elas sem motivo.
        hidden_entries: hidden,
        solo_instances: instancesResult.data ?? [],
        // SE-REV-005 — para o preview de {{tenant.name}} na tela.
        tenant_name: teamResult.data?.nome ?? null,
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
      // SE-REV-005 — ligar sequência numa porta que não recebe lead (webhook
      // apagado, porta inativa) esconderia o problema: ela nunca dispararia.
      // Desligar/editar uma sequência antiga nessa porta continua permitido.
      if (sequence.active === true && entryIds.length) {
        const { entries } = await loadTeamEntries(supabase, caller.equipeId);
        const unusable = ineligibleEntryIds(entryIds, entries);
        if (unusable.length) {
          throw new HttpError(
            `Porta inativa ou com webhook apagado: ${
              unusable.join(", ")
            }. Escolha outra porta ou salve a sequência desligada.`,
          );
        }
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
      const row = {
        id: sequenceId || null,
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
      // SE-REV-004: sequência, passos e desativação dos removidos numa única
      // transação (a RPC confere o time do id). Antes eram três escritas
      // soltas e uma falha no meio deixava a sequência com conteúdo misturado.
      const { data: saved, error: saveError } = await supabase.rpc(
        "crm_outreach_save_sequence",
        { p_equipe_id: caller.equipeId, p_sequence: row, p_steps: steps },
      );
      if (saveError) {
        if (saveError.code === "P0002") {
          throw new HttpError("Sequência inexistente neste time", 404);
        }
        throw saveError;
      }
      return json({ sequence: saved });
    }

    if (action === "delete-sequence") {
      // SE-REV-005 — apagar sequência. Ordem pensada para que qualquer parada
      // no meio deixe um estado coerente e uma nova chamada termine o serviço:
      //   1. desliga (o gatilho trg_cadence_sequences_disabled cancela as
      //      inscrições ativas e os jobs na fila, motivo 'sequence_disabled');
      //   2. cancela o que ainda estiver ativo (sequência já desligada antes);
      //   3. recusa (409) se houver job 'running' — um envio em curso, cujo
      //      registro o worker ainda vai gravar;
      //   4. apaga. As FKs em cascata levam passos, inscrições e jobs. As
      //      mensagens já enviadas continuam no chat (messages) e na timeline
      //      do lead (lead_activities).
      if (!caller.profileId) {
        throw new HttpError("Só usuário autenticado apaga sequências", 403);
      }
      const sequenceId = text(body.sequence_id);
      if (!sequenceId) throw new HttpError("sequence_id é obrigatório");
      const { data: sequence, error: sequenceError } = await supabase
        .from("cadence_sequences").select("id, equipe_id, name, active")
        .eq("id", sequenceId).maybeSingle();
      if (sequenceError) throw sequenceError;
      if (!sequence || sequence.equipe_id !== caller.equipeId) {
        throw new HttpError(
          "Sequência inexistente neste time",
          404,
          "sequence_not_found",
        );
      }
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("cadence_enrollments").select("id, status")
        .eq("sequence_id", sequence.id).eq("equipe_id", caller.equipeId);
      if (enrollmentsError) throw enrollmentsError;
      const activeIds = (enrollments ?? [])
        .filter((row) => row.status === "active").map((row) => row.id);
      if (sequence.active) {
        const { error } = await supabase.from("cadence_sequences")
          .update({ active: false }).eq("id", sequence.id)
          .eq("equipe_id", caller.equipeId);
        if (error) throw error;
      }
      if (activeIds.length) {
        // Idempotente: só mexe no que ainda está 'active' (o gatilho do passo
        // 1 normalmente já cancelou tudo e aqui não sobra nada).
        const { error } = await supabase.rpc("_outreach_cancel_enrollments", {
          p_ids: activeIds,
          p_reason: "sequence_disabled",
        });
        if (error) throw error;
      }
      const { data: jobs, error: jobsError } = await supabase
        .from("outreach_jobs")
        .select("status, cadence_enrollments!inner(sequence_id)")
        .eq("cadence_enrollments.sequence_id", sequence.id)
        .eq("equipe_id", caller.equipeId);
      if (jobsError) throw jobsError;
      const jobCounts: Record<string, number> = {};
      for (const job of jobs ?? []) {
        jobCounts[job.status] = (jobCounts[job.status] ?? 0) + 1;
      }
      // Contagem própria para 'running': a lista acima para em 1000 linhas.
      const { count: running, error: runningError } = await supabase
        .from("outreach_jobs")
        .select("id, cadence_enrollments!inner(sequence_id)", {
          count: "exact",
          head: true,
        })
        .eq("cadence_enrollments.sequence_id", sequence.id)
        .eq("status", "running");
      if (runningError) throw runningError;
      if (running) {
        throw new HttpError(
          "Há uma mensagem desta sequência sendo enviada agora. A sequência já foi desligada; tente apagar de novo em 1 minuto.",
          409,
          "sequence_sending",
        );
      }
      const { error: deleteError } = await supabase.from("cadence_sequences")
        .delete().eq("id", sequence.id).eq("equipe_id", caller.equipeId);
      if (deleteError) throw deleteError;
      return json({
        deleted: true,
        sequence_id: sequence.id,
        name: sequence.name,
        enrollments_removed: enrollments?.length ?? 0,
        enrollments_cancelled: activeIds.length,
        jobs_removed: jobCounts,
      });
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
