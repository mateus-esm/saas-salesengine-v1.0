import { useState, useCallback, useEffect } from "react";

export function useCollapsedStages(pipelineId: string) {
  const storageKey = `crm_collapsed_stages_${pipelineId}`;

  const [collapsedStageIds, setCollapsedStageIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      setCollapsedStageIds(stored ? JSON.parse(stored) : []);
    } catch {
      setCollapsedStageIds([]);
    }
  }, [storageKey]);

  const toggleStage = useCallback(
    (stageId: string) => {
      setCollapsedStageIds((prev) => {
        const next = prev.includes(stageId)
          ? prev.filter((id) => id !== stageId)
          : [...prev, stageId];
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  const isCollapsed = useCallback(
    (stageId: string) => collapsedStageIds.includes(stageId),
    [collapsedStageIds],
  );

  return { collapsedStageIds, toggleStage, isCollapsed };
}
