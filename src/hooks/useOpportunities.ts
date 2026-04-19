import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
      let q = sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);

      if (pipelineId) q = q.eq("pipeline_id", pipelineId);
      if (leadId) q = q.eq("lead_id", leadId);

      const { data, error } = await q.order("position", { ascending: true });
      if (error) throw error;
      return ((data || []) as OpportunityRow[]).map(normalize);
    },
    enabled: !!equipeId,
  });

  useEffect(() => {
    if (!equipeId) return;
    const channel = sb
      .channel(`opportunities_${equipeId}_${pipelineId ?? "all"}_${leadId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `equipe_id=eq.${equipeId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
    // queryKey is derived from these — including the array would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeId, pipelineId, leadId, queryClient]);

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
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
      toast.success("Oportunidade criada!");
    },
    onError: (e: Error) => toast.error("Erro ao criar oportunidade: " + e.message),
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
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
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
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
      toast.success("Oportunidade removida");
    },
    onError: (e: Error) => toast.error("Erro ao remover: " + e.message),
  });

  return {
    opportunities: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    refetch: query.refetch,
  };
};
