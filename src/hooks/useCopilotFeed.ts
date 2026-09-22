// Sprint 11 · Onda 6 · T64 — what the Copilot did and what waits for a person.
//
// crm_copilot_feed (dashboard scope: a seller sees their own deals); approve /
// reject through crm_copilot_resolve (checked again against the deal of now),
// undo through crm_copilot_undo (refused if someone changed it since).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_FEED,
  bulkResolveText,
  resolveText,
  summarizeBulk,
  undoText,
  type BulkResolveSummary,
  type CopilotFeed,
} from "@/lib/copilotFeed";

const sb = supabase as any;

export const copilotFeedKey = ["copilot", "feed"] as const;

/** Approve / reject a suggestion and undo an action — the home and the deal panel share these. */
export function useCopilotDecisionActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: copilotFeedKey });
    void queryClient.invalidateQueries({ queryKey: ["copilot", "deal"] });
    void queryClient.invalidateQueries({ queryKey: ["copilot", "approvals"] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["board"] });
  };

  const resolve = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data, error } = await sb.rpc("crm_copilot_resolve", { p_decision_id: id, p_approve: approve });
      if (error) throw error;
      return { approve, result: data as { ok?: boolean; reason?: string } };
    },
    onSuccess: ({ approve, result }) => {
      const problem = resolveText(result);
      if (problem) toast.warning(problem);
      else toast.success(approve ? "Aplicado." : "Sugestão recusada.");
      refresh();
    },
    onError: (e: Error) => toast.error("Não deu: " + e.message),
  });

  const undo = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.rpc("crm_copilot_undo", { p_decision_id: id });
      if (error) throw error;
      return data as { ok?: boolean; reason?: string };
    },
    onSuccess: (result) => {
      const problem = undoText(result);
      if (problem) toast.warning(problem);
      else toast.success("Desfeito.");
      refresh();
    },
    onError: (e: Error) => toast.error("Não deu para desfazer: " + e.message),
  });

  /**
   * Approve or reject many suggestions at once. `crm_copilot_resolve` already
   * re-checks each suggestion against the deal of now and only touches its own
   * row, so running them one by one is safe; we just gather the answers into a
   * single summary instead of a toast per item.
   */
  const resolveMany = useMutation({
    mutationFn: async ({ ids, approve }: { ids: string[]; approve: boolean }): Promise<BulkResolveSummary> => {
      const settled = await Promise.allSettled(
        ids.map(async (id) => {
          const { data, error } = await sb.rpc("crm_copilot_resolve", { p_decision_id: id, p_approve: approve });
          if (error) throw error;
          return (data ?? {}) as { ok?: boolean; reason?: string };
        }),
      );

      return summarizeBulk(settled.map((outcome) => (outcome.status === "fulfilled" ? outcome.value : null)));
    },
    onSuccess: (summary, { approve }) => {
      const { tone, text } = bulkResolveText(approve, summary);
      if (tone === "success") toast.success(text);
      else if (tone === "warning") toast.warning(text);
      else toast.error(text);
      refresh();
    },
    onError: (e: Error) => toast.error("Não deu: " + e.message),
  });

  return { resolve, resolveMany, undo };
}

export function useCopilotFeed(enabled = true) {
  const feed = useQuery({
    queryKey: copilotFeedKey,
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<CopilotFeed> => {
      const { data, error } = await sb.rpc("crm_copilot_feed", { p_limit: 60 });
      if (error) throw error;
      return { ...EMPTY_FEED, ...(data ?? {}) } as CopilotFeed;
    },
  });
  const { resolve, resolveMany, undo } = useCopilotDecisionActions();

  return {
    feed: feed.data ?? EMPTY_FEED,
    isLoading: feed.isLoading,
    isError: feed.isError,
    refetch: feed.refetch,
    resolve,
    resolveMany,
    undo,
  };
}
