import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { OriginTag, TaxonomyKind } from "@/types/taxonomy";

const TABLE = "origin_taxonomy";
const DEFAULT_COLOR = "#64748b";

export interface CreateOriginTagInput {
  kind: TaxonomyKind;
  label: string;
  color?: string;
}

export interface UpdateOriginTagInput {
  id: string;
  label?: string;
  color?: string;
}

export const useOriginTaxonomy = (kind?: TaxonomyKind) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const taxonomyQuery = useQuery({
    queryKey: ["origin_taxonomy", equipeId, kind ?? "all"],
    queryFn: async (): Promise<OriginTag[]> => {
      if (!equipeId) return [];

      let query = supabase
        .from(TABLE)
        .select("id, equipe_id, kind, label, color, created_at, deleted_at")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("kind", { ascending: true })
        .order("label", { ascending: true });

      if (kind) {
        query = query.eq("kind", kind);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as OriginTag[];
    },
    enabled: !!equipeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["origin_taxonomy", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["origin_taxonomy"] });
  };

  const createTag = useMutation({
    mutationFn: async (input: CreateOriginTagInput): Promise<OriginTag> => {
      if (!equipeId) throw new Error("No equipe_id");
      const label = input.label.trim();
      if (!label) throw new Error("Informe um label para a tag.");

      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          kind: input.kind,
          label,
          color: input.color ?? DEFAULT_COLOR,
        })
        .select("id, equipe_id, kind, label, color, created_at, deleted_at")
        .single();

      if (error) throw error;
      return data as OriginTag;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tag criada");
    },
    onError: (e: Error) => toast.error("Erro ao criar tag: " + e.message),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateOriginTagInput): Promise<OriginTag> => {
      const nextPatch: Partial<Pick<OriginTag, "label" | "color">> = {};
      if (patch.label !== undefined) {
        const label = patch.label.trim();
        if (!label) throw new Error("Informe um label para a tag.");
        nextPatch.label = label;
      }
      if (patch.color !== undefined) {
        nextPatch.color = patch.color;
      }

      const { data, error } = await supabase
        .from(TABLE)
        .update(nextPatch)
        .eq("id", id)
        .eq("equipe_id", equipeId)
        .select("id, equipe_id, kind, label, color, created_at, deleted_at")
        .single();

      if (error) throw error;
      return data as OriginTag;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tag atualizada");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar tag: " + e.message),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("equipe_id", equipeId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tag removida");
    },
    onError: (e: Error) => toast.error("Erro ao remover tag: " + e.message),
  });

  return {
    tags: taxonomyQuery.data ?? [],
    isLoading: taxonomyQuery.isLoading,
    error: taxonomyQuery.error,
    createTag,
    updateTag,
    deleteTag,
    refetch: taxonomyQuery.refetch,
  };
};
