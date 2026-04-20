import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { usePipelines } from "./usePipelines";

const STORAGE_KEY = "crm.selectedPipelineId";

/**
 * Source of truth for the active pipeline in /crm views.
 *
 * Resolution order:
 *   1. `?pipeline=<id>` URL param (deep-linkable, copy/paste-able)
 *   2. `localStorage` last selection (per-user stickiness across sessions)
 *   3. First active pipeline for the tenant (sensible default)
 *
 * Setter writes to both URL and localStorage so the two never diverge.
 */
export const usePipelineSelection = () => {
  const { activePipelines, isLoading } = usePipelines();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlId = searchParams.get("pipeline");
  const storedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

  const resolved = useMemo(() => {
    if (!activePipelines.length) return null;
    const candidates = [urlId, storedId].filter(Boolean) as string[];
    for (const id of candidates) {
      if (activePipelines.some((p) => p.id === id)) return id;
    }
    return activePipelines[0].id;
  }, [activePipelines, urlId, storedId]);

  // Backfill URL once the default resolves, so sharing the link preserves the choice.
  useEffect(() => {
    if (!resolved || urlId === resolved) return;
    const next = new URLSearchParams(searchParams);
    next.set("pipeline", resolved);
    setSearchParams(next, { replace: true });
  }, [resolved, urlId, searchParams, setSearchParams]);

  const setPipeline = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("pipeline", id);
      setSearchParams(next, { replace: false });
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    },
    [searchParams, setSearchParams],
  );

  return {
    pipelineId: resolved,
    setPipeline,
    pipelines: activePipelines,
    isLoading,
  };
};
