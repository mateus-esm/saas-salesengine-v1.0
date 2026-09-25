// deno-lint-ignore-file no-import-prefix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { persistDeliveredMessage } from "../_shared/outreach/persist.ts";
import type { OutreachSettings } from "../_shared/outreach/providers.ts";
import {
  type JobContext,
  type OutreachJob,
  processOutreachBatch,
} from "../_shared/outreach/worker.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const expected = Deno.env.get("OUTREACH_WORKER_SECRET") ?? "";
  if (!expected || req.headers.get("x-outreach-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 100);

  try {
    const result = await processOutreachBatch({
      supabase,
      claim: async (batchLimit) => {
        const { data, error } = await supabase.rpc("crm_outreach_claim", {
          p_limit: batchLimit,
        });
        if (error) throw error;
        return (data ?? []) as OutreachJob[];
      },
      loadContext: async (job): Promise<JobContext> => {
        const [
          leadResult,
          enrollmentResult,
          stepResult,
          settingsResult,
          teamResult,
        ] = await Promise.all([
          supabase.from("leads").select("id, name, phone, source").eq(
            "id",
            job.lead_id,
          ).single(),
          supabase.from("cadence_enrollments").select("id, sequence_id").eq(
            "id",
            job.enrollment_id,
          ).single(),
          supabase.from("cadence_steps").select("message_template").eq(
            "id",
            job.step_id,
          ).maybeSingle(),
          supabase.from("conversation_opener_settings")
            .select(
              "provider, channel_id, solo_instance_id, send_window_start, send_window_end, timezone, max_sends_per_line_hour",
            )
            .eq("equipe_id", job.equipe_id)
            .maybeSingle(),
          supabase.from("equipes").select("nome").eq("id", job.equipe_id)
            .single(),
        ]);
        for (
          const result of [
            leadResult,
            enrollmentResult,
            stepResult,
            settingsResult,
            teamResult,
          ]
        ) {
          if (result.error) throw result.error;
        }
        if (!leadResult.data) throw new Error("lead_not_found");
        if (!enrollmentResult.data) throw new Error("enrollment_not_found");
        if (!teamResult.data) throw new Error("team_not_found");
        if (!stepResult.data?.message_template) {
          throw new Error("cadence_step_not_found");
        }
        const rawSettings = (settingsResult.data ?? {}) as Partial<{
          provider: string;
          channel_id: string | null;
          solo_instance_id: string | null;
          send_window_start: string;
          send_window_end: string;
          timezone: string;
          max_sends_per_line_hour: number;
        }>;
        const provider: OutreachSettings["provider"] =
          rawSettings.provider === "solo" ? "solo" : "gptmaker";
        return {
          lead: leadResult.data,
          enrollment: enrollmentResult.data,
          step: stepResult.data,
          settings: {
            provider,
            channel_id: rawSettings.channel_id ?? null,
            solo_instance_id: rawSettings.solo_instance_id ?? null,
            send_window_start: rawSettings.send_window_start ?? "08:00",
            send_window_end: rawSettings.send_window_end ?? "20:00",
            timezone: rawSettings.timezone ?? "America/Sao_Paulo",
            max_sends_per_line_hour: rawSettings.max_sends_per_line_hour ?? 30,
          },
          tenant: { name: teamResult.data.nome ?? null },
        };
      },
      isSuspended: async (equipeId) => {
        const { data, error } = await supabase.rpc("tenant_is_suspended", {
          p_equipe_id: equipeId,
        });
        if (error) throw error;
        return data === true;
      },
      lineUsage: async (lineKey) => {
        const { data, error } = await supabase.rpc("crm_outreach_line_usage", {
          p_line_key: lineKey,
          p_window_minutes: 60,
        });
        if (error) throw error;
        return Number(data ?? 0);
      },
      defer: async (jobId, until, reason) => {
        const { error } = await supabase.rpc("crm_outreach_defer", {
          p_job_id: jobId,
          p_run_after: until.toISOString(),
          p_reason: reason,
        });
        if (error) throw error;
      },
      finish: async (jobId, status, errorMessage, delivery, retryable) => {
        const { error } = await supabase.rpc("crm_outreach_finish", {
          p_job_id: jobId,
          p_status: status,
          p_error: errorMessage,
          p_result: delivery,
          p_retryable: retryable,
        });
        if (error) throw error;
      },
      persist: async (job, context, text, line, delivery) =>
        await persistDeliveredMessage(supabase, {
          jobId: job.id,
          enrollmentId: job.enrollment_id,
          sequenceId: context.enrollment.sequence_id,
          stepPosition: job.step_position,
          equipeId: job.equipe_id,
          leadId: job.lead_id,
          text,
          line,
          delivery,
        }),
    }, limit);
    return json({ success: true, ...result });
  } catch (error) {
    console.error("[outreach-worker] falha no lote:", error);
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
