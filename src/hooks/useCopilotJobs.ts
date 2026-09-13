// Sprint 11 · Onda 6 · T61 — queue a Copilot pass and follow it.
//
// crm_copilot_enqueue puts the deal (or the stage's / pipeline's deals with a new
// conversation) at the front of the queue and returns the job ids; this hook
// follows those jobs while any of them is still waiting or running.

import { useMutation, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CopilotJobRow } from "@/lib/copilotJobs";

const sb = supabase as any;

export interface EnqueueArgs {
  opportunityId?: string;
  leadId?: string;
  stageId?: string;
  pipelineId?: string;
}

export interface EnqueueResult {
  queued: number;
  job_ids: string[];
}

export function useCopilotEnqueue() {
  return useMutation({
    mutationFn: async (args: EnqueueArgs): Promise<EnqueueResult> => {
      const { data, error } = await sb.rpc("crm_copilot_enqueue", {
        p_opportunity_id: args.opportunityId ?? null,
        p_lead_id: args.opportunityId ? null : args.leadId ?? null,
        p_stage_id: args.stageId ?? null,
        p_pipeline_id: args.stageId ? null : args.pipelineId ?? null,
      });
      if (error) throw error;
      return { queued: Number(data?.queued) || 0, job_ids: (data?.job_ids as string[]) ?? [] };
    },
  });
}

const ACTIVE = new Set(["queued", "running"]);

/** The jobs a Sync queued; refreshed every 2.5 s while any of them is still going. */
export function useCopilotJobsStatus(jobIds: string[]) {
  const query = useQuery({
    queryKey: ["copilot_jobs", "status", jobIds],
    enabled: jobIds.length > 0,
    queryFn: async (): Promise<CopilotJobRow[]> => {
      const rows: CopilotJobRow[] = [];
      // .in() with hundreds of ids makes a long URL: ask in chunks.
      for (let i = 0; i < jobIds.length; i += 100) {
        const { data, error } = await sb
          .from("copilot_jobs")
          .select("id, opportunity_id, status, reason, attempts, last_error, result, run_after, finished_at")
          .in("id", jobIds.slice(i, i + 100));
        if (error) throw error;
        rows.push(...((data ?? []) as CopilotJobRow[]));
      }
      return rows;
    },
    refetchInterval: (q) => {
      const rows = (q.state.data as CopilotJobRow[] | undefined) ?? [];
      const going = rows.length < jobIds.length || rows.some((r) => ACTIVE.has(r.status));
      return jobIds.length > 0 && going ? 2500 : false;
    },
  });
  return { jobs: query.data ?? [], isLoading: query.isLoading };
}
