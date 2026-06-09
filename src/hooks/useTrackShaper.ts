// src/hooks/useTrackShaper.ts
// Sprint 6 — C4: Self-Shaping Track setup dashboard hook
//
// Wraps copilot.shapePreview + copilot.shapeApply with simple async loading
// state. On apply success: invalidates ["pipelines", equipeId] + shows toast.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { shapePreview, shapeApply } from "@/services/copilot";
import type { PipelineBlueprint } from "@/services/copilot";

export interface UseTrackShaperReturn {
  // Preview state
  blueprint: PipelineBlueprint | null;
  isPreviewing: boolean;
  previewError: string | null;
  generatePreview: (prompt: string) => Promise<void>;

  // Apply state
  isApplying: boolean;
  applyBlueprint: () => Promise<boolean>;

  // Reset helper
  reset: () => void;
}

export function useTrackShaper(): UseTrackShaperReturn {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const [blueprint, setBlueprint] = useState<PipelineBlueprint | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const generatePreview = async (prompt: string): Promise<void> => {
    setIsPreviewing(true);
    setPreviewError(null);
    setBlueprint(null);
    try {
      const result = await shapePreview(prompt, "pt-BR");
      setBlueprint(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
      toast.error("Erro ao gerar prévia: " + msg);
    } finally {
      setIsPreviewing(false);
    }
  };

  const applyBlueprint = async (): Promise<boolean> => {
    if (!blueprint) return false;
    setIsApplying(true);
    try {
      await shapeApply(blueprint);
      await queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] });
      toast.success("Pipeline criada com sucesso!");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao criar pipeline: " + msg);
      return false;
    } finally {
      setIsApplying(false);
    }
  };

  const reset = () => {
    setBlueprint(null);
    setPreviewError(null);
    setIsPreviewing(false);
    setIsApplying(false);
  };

  return {
    blueprint,
    isPreviewing,
    previewError,
    generatePreview,
    isApplying,
    applyBlueprint,
    reset,
  };
}
