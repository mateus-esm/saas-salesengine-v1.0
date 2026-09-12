import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { createDebouncer } from "@/lib/debounce";
import { patchRowInCache } from "@/lib/tablePages";

import type {
  Opportunity,
  CreateOpportunityData,
  UpdateOpportunityData,
} from "@/types/pipelines";

// Database types lag the new opportunities + pipeline_stages_v2 tables until
// `supabase gen types` reruns. Same escape hatch as useConversations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "opportunities";
const STAGES_TABLE = "pipeline_stages_v2";

interface OpportunityRow {
  id: string;
  equipe_id: string;
  lead_id: string;
  pipeline_id: string;
  stage_id: string;
  value: number | string | null;
  currency: string | null;
  status: string | null;
  position: number | null;
  custom_data: Record<string, unknown> | null;
  stage_entered_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const normalize = (row: OpportunityRow): Opportunity => ({
  id: row.id,
  equipe_id: row.equipe_id,
  lead_id: row.lead_id,
  pipeline_id: row.pipeline_id,
  stage_id: row.stage_id,
  value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
  currency: row.currency || "BRL",
  status: (row.status as Opportunity["status"]) || "open",
  position: row.position ?? 0,
  custom_data: (row.custom_data as Record<string, unknown>) || {},
  stage_entered_at: row.stage_entered_at,
  closed_at: row.closed_at ?? null,
  lost_reason: row.lost_reason ?? null,
  owner_id: row.owner_id ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  deleted_at: row.deleted_at ?? null,
});

interface UseOpportunitiesOptions {
  pipelineId?: string;
  leadId?: string;
}

/**
 * Opportunities for the current tenant. Filter by pipelineId (Kanban) or leadId
 * (Lead drawer cross-pipeline list). Both filters can be combined.
 */
export const useOpportunities = (opts: UseOpportunitiesOptions = {}) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;
  const { pipelineId, leadId } = opts;

  const queryKey = ["opportunities", equipeId, pipelineId ?? null, leadId ?? null];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Opportunity[]> => {
      if (!equipeId) return [];
      // Sprint 11: every page, not just the first 1,000 rows (the API cap hid 259
      // Solo Energia deals). `id` breaks the ties in `position` — 1,259 deals sat
      // at position 0 — so pages cannot repeat or skip rows.
      const rows = await fetchAllPages<OpportunityRow>((from, to) => {
        let q = sb
          .from(TABLE)
          .select("*")
          .eq("equipe_id", equipeId)
          .is("deleted_at", null);
        if (pipelineId) q = q.eq("pipeline_id", pipelineId);
        if (leadId) q = q.eq("lead_id", leadId);
        return q
          .order("position", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
      });
      return rows.map(normalize);
    },
    enabled: !!equipeId,
  });

  useEffect(() => {
    if (!equipeId) return;
    // Sprint 11: a burst of changes (the Copilot, a bulk move, a webhook) used to
    // refetch the whole list once per row. Grouped now.
    const refresh = createDebouncer(
      () => queryClient.invalidateQueries({ queryKey }),
      1000,
      { maxWait: 5000 },
    );
    const channel = sb
      .channel(`opportunities_${equipeId}_${pipelineId ?? "all"}_${leadId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `equipe_id=eq.${equipeId}` },
        () => refresh.call(),
      )
      .subscribe();
    return () => {
      refresh.cancel();
      sb.removeChannel(channel);
    };
    // queryKey is derived from these — including the array would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeId, pipelineId, leadId, queryClient]);

  const mutations = useOpportunityMutations();

  return {
    opportunities: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    ...mutations,
    refetch: query.refetch,
  };
};

/**
 * Sprint 11 — the opportunity mutations without the list query.
 *
 * The detail modal used to call useOpportunities() only to get these, and it is
 * mounted even while closed — with no pipelineId, so every Kanban visit loaded
 * every opportunity of the team a second time. Anything that only edits should
 * use this hook. Invalidates the Kanban board cache too, so an edit made in the
 * modal shows up on the card.
 */
export const useOpportunityMutations = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["board", equipeId] });
    // Sprint 11 · Onda 2 — the server-side tables show deals too.
    queryClient.invalidateQueries({ queryKey: ["opp_table", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["contacts_table", equipeId] });
    // Sprint 11 · T31 — a win, reopen or value change moves the revenue.
    queryClient.invalidateQueries({ queryKey: ["deal_revenue"] });
  };

  const createOpportunity = useMutation({
    mutationFn: async (input: CreateOpportunityData): Promise<Opportunity> => {
      if (!equipeId) throw new Error("No equipe_id");

      let stageId = input.stage_id;
      if (!stageId) {
        const { data: stage, error: sErr } = await sb
          .from(STAGES_TABLE)
          .select("id")
          .eq("pipeline_id", input.pipeline_id)
          .is("deleted_at", null)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (sErr) throw sErr;
        if (!stage) {
          throw new Error("Pipeline não possui etapas. Crie ao menos uma antes.");
        }
        stageId = stage.id;
      }

      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          lead_id: input.lead_id,
          pipeline_id: input.pipeline_id,
          stage_id: stageId,
          value: input.value ?? null,
          currency: input.currency || "BRL",
          custom_data: input.custom_data || {},
        })
        .select()
        .single();
      if (error) throw error;
      return normalize(data as OpportunityRow);
    },
    onSuccess: () => {
      invalidateLists();
      toast.success("Lead criado!");
    },
    onError: (e: Error) => toast.error("Erro ao criar lead: " + e.message),
  });

  const updateOpportunity = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateOpportunityData): Promise<Opportunity> => {
      const { data, error } = await sb
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return normalize(data as OpportunityRow);
    },
    onSuccess: () => {
      invalidateLists();
    },
    onError: (e: Error) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteOpportunity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateLists();
      toast.success("Lead removido");
    },
    onError: (e: Error) => toast.error("Erro ao remover: " + e.message),
  });

  // Mass delete moved to the business verb crm_delete_opportunities (Sprint 11 ·
  // T13/T18, useDeleteOpportunities): ids in the POST body, not in the URL.

  // Sprint 11 · Onda 2 · T20 — the owner is saved on its own, the moment it is
  // chosen (the business verb records the change in the owner history). Every
  // board column and table loaded shows the new owner before the server answers.
  const setOwner = useMutation({
    mutationFn: async ({ id, owner_id }: SetOwnerVars) => {
      const { error } = await sb.rpc("crm_update_opportunities", {
        p_ids: [id],
        p_patch: { owner_id },
      });
      if (error) throw error;
    },
    onMutate: async ({ id, owner_id, owner_name }: SetOwnerVars) => {
      const scopes = [{ queryKey: ["board", equipeId] }, { queryKey: ["opp_table", equipeId] }];
      await Promise.all(scopes.map((s) => queryClient.cancelQueries(s)));
      const snapshots = scopes.flatMap((s) => queryClient.getQueriesData(s));
      for (const s of scopes) {
        queryClient.setQueriesData(s, (data: unknown) => patchRowInCache(data, id, { owner_id, owner_name }));
      }
      return { snapshots };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error("Erro ao trocar o responsável: " + e.message);
    },
    onSettled: () => {
      invalidateLists();
    },
  });

  return {
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    setOwner,
  };
};

export interface SetOwnerVars {
  id: string;
  owner_id: string | null;
  /** Shown on the card and the table until the server answers. */
  owner_name: string | null;
}
