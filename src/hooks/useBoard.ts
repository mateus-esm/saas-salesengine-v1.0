// Sprint 11 — the server-side Kanban.
//
// The board used to load the whole pipeline plus every lead of the team into the
// browser. The API caps a query at 1,000 rows, so on Solo Energia 259 of 1,259
// deals never showed, and the cards were named from a leads list that was also
// capped. Now:
//
//   useBoardSummary  → crm_board_summary: each column's TRUE count and value.
//   useBoardStage    → crm_board_stage: one column, 30 cards a page, loaded as
//                      the user scrolls. Each card arrives complete (lead, owner,
//                      touchpoints, score, companies) — no per-card requests.
//
// Filters go to the server as one object (CrmFilters), and the same SQL function
// filters the summary and the pages, so a column's count always matches its cards.

import { useEffect, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  adjustSummaryForMove,
  cleanFilters,
  getNextPageOffset,
  normalizeBoardCard,
  prependCardToPages,
  removeCardFromPages,
  type BoardPages,
} from "@/lib/board";
import { createDebouncer } from "@/lib/debounce";
import type { BoardCard, BoardStageSummary } from "@/types/board";
import type { CrmFilters } from "@/types/crmFilters";

// The generated types do not know the Sprint 11 RPCs yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const BOARD_PAGE_SIZE = 30;

export const boardKeys = {
  all: (equipeId: string | undefined) => ["board", equipeId] as const,
  pipeline: (equipeId: string | undefined, pipelineId: string | undefined) =>
    ["board", equipeId, pipelineId] as const,
  summary: (equipeId: string | undefined, pipelineId: string | undefined, filters: CrmFilters) =>
    ["board", equipeId, pipelineId, "summary", filters] as const,
  stage: (
    equipeId: string | undefined,
    pipelineId: string | undefined,
    stageId: string,
    filters: CrmFilters,
  ) => ["board", equipeId, pipelineId, "stage", stageId, filters] as const,
};

/** Each column's true totals under the current filters. */
export function useBoardSummary(pipelineId: string | undefined, filters: CrmFilters) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const f = useMemo(() => cleanFilters(filters), [filters]);

  return useQuery({
    queryKey: boardKeys.summary(equipeId, pipelineId, f),
    queryFn: async (): Promise<BoardStageSummary[]> => {
      const { data, error } = await sb.rpc("crm_board_summary", {
        p_pipeline_id: pipelineId,
        p_filters: f,
      });
      if (error) throw error;
      return ((data ?? []) as BoardStageSummary[]).map((s) => ({
        stage_id: s.stage_id,
        count: Number(s.count) || 0,
        value_sum: Number(s.value_sum) || 0,
      }));
    },
    enabled: !!equipeId && !!pipelineId,
    // Keep the old totals on screen while a new filter is being counted.
    placeholderData: keepPreviousData,
  });
}

/** One column, loaded 30 cards at a time as the user scrolls. */
export function useBoardStage(
  pipelineId: string | undefined,
  stageId: string,
  filters: CrmFilters,
) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const f = useMemo(() => cleanFilters(filters), [filters]);

  return useInfiniteQuery({
    queryKey: boardKeys.stage(equipeId, pipelineId, stageId, f),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<BoardCard[]> => {
      const { data, error } = await sb.rpc("crm_board_stage", {
        p_pipeline_id: pipelineId,
        p_stage_id: stageId,
        p_filters: f,
        p_limit: BOARD_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeBoardCard);
    },
    getNextPageParam: (lastPage, allPages) =>
      getNextPageOffset(lastPage, allPages, BOARD_PAGE_SIZE),
    enabled: !!equipeId && !!pipelineId,
  });
}

/**
 * Refreshes the board when a deal in this pipeline changes elsewhere (another
 * seller, the Copilot, a webhook). Changes are grouped: one refetch per quiet
 * second, and at least one every 5 s under a constant stream.
 */
export function useBoardRealtime(pipelineId: string | undefined) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!equipeId || !pipelineId) return;
    const refresh = createDebouncer(
      () => queryClient.invalidateQueries({ queryKey: boardKeys.pipeline(equipeId, pipelineId) }),
      1000,
      { maxWait: 5000 },
    );
    const channel = sb
      .channel(`board_${equipeId}_${pipelineId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opportunities", filter: `pipeline_id=eq.${pipelineId}` },
        () => refresh.call(),
      )
      .subscribe();
    return () => {
      refresh.cancel();
      sb.removeChannel(channel);
    };
  }, [equipeId, pipelineId, queryClient]);
}

interface MoveVars {
  card: BoardCard;
  toStageId: string;
  /** Sprint 11 · T28 — the status the deal takes there (lib/outcome); the database decides it too. */
  toStatus?: BoardCard["status"];
}

/**
 * Drag-and-drop: moves the card between the two columns' caches and the
 * summary before the server answers, and puts everything back if it fails.
 */
export function useMoveBoardCard(pipelineId: string | undefined, filters: CrmFilters) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();
  const f = useMemo(() => cleanFilters(filters), [filters]);

  return useMutation({
    mutationFn: async ({ card, toStageId }: MoveVars) => {
      const { error } = await sb
        .from("opportunities")
        .update({ stage_id: toStageId })
        .eq("id", card.id);
      if (error) throw error;
    },
    onMutate: async ({ card, toStageId, toStatus }: MoveVars) => {
      const fromKey = boardKeys.stage(equipeId, pipelineId, card.stage_id, f);
      const toKey = boardKeys.stage(equipeId, pipelineId, toStageId, f);
      const summaryKey = boardKeys.summary(equipeId, pipelineId, f);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: fromKey }),
        queryClient.cancelQueries({ queryKey: toKey }),
        queryClient.cancelQueries({ queryKey: summaryKey }),
      ]);

      const previous = {
        from: queryClient.getQueryData<BoardPages>(fromKey),
        to: queryClient.getQueryData<BoardPages>(toKey),
        summary: queryClient.getQueryData<BoardStageSummary[]>(summaryKey),
      };

      const { pages: fromPages } = removeCardFromPages(previous.from, card.id);
      if (fromPages) queryClient.setQueryData(fromKey, fromPages);

      const now = new Date().toISOString();
      const status = toStatus ?? card.status;
      const moved: BoardCard = {
        ...card,
        stage_id: toStageId,
        stage_entered_at: now,
        status,
        closed_at: status === "open" ? null : card.status === status ? card.closed_at : now,
        lost_reason: status === "open" ? null : card.lost_reason,
      };
      const toPages = prependCardToPages(previous.to, moved);
      if (toPages) queryClient.setQueryData(toKey, toPages);

      if (previous.summary) {
        queryClient.setQueryData(
          summaryKey,
          adjustSummaryForMove(previous.summary, card.stage_id, toStageId, card.value),
        );
      }

      return { previous, fromKey, toKey, summaryKey };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx) {
        if (ctx.previous.from) queryClient.setQueryData(ctx.fromKey, ctx.previous.from);
        if (ctx.previous.to) queryClient.setQueryData(ctx.toKey, ctx.previous.to);
        if (ctx.previous.summary) queryClient.setQueryData(ctx.summaryKey, ctx.previous.summary);
      }
      toast.error("Erro ao mover: " + e.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: boardKeys.pipeline(equipeId, pipelineId) });
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
    },
  });
}
