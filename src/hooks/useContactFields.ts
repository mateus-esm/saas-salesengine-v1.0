import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import type { CustomFieldSchema } from "@/types/pipelines";
import { CONTACT_ENRICHMENT_SCHEMA } from "@/config/contactEnrichmentSchema";

// Same escape hatch used across this codebase — DB types lag migrations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "equipes";

/**
 * Sprint 6.4 W2 — CRUD hook for the tenant contact-field dictionary stored in
 * `equipes.contact_fields_schema` (jsonb array of CustomFieldSchema).
 *
 * On first open, if the column is null/empty we seed it with the canonical
 * hard-coded enrichment fields from `CONTACT_ENRICHMENT_SCHEMA` so the UI
 * always has something to display and the Copilot has an initial vocabulary.
 *
 * Mirrors `useAgentRules` patterns: react-query + supabase + toast.
 */
export const useContactFields = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey = ["contact_fields_schema", equipeId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<CustomFieldSchema[]> => {
      if (!equipeId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("contact_fields_schema")
        .eq("id", equipeId)
        .maybeSingle();
      if (error) throw error;
      const stored = data?.contact_fields_schema;
      if (Array.isArray(stored) && stored.length > 0) {
        return stored as CustomFieldSchema[];
      }
      // Seed with canonical fields on first open (null or empty array)
      return CONTACT_ENRICHMENT_SCHEMA;
    },
    enabled: !!equipeId,
  });

  /** Replace the entire schema array on the tenant row. */
  const upsertFields = useMutation({
    mutationFn: async (next: CustomFieldSchema[]) => {
      if (!equipeId) throw new Error("No equipe_id");
      const { error } = await sb
        .from(TABLE)
        .update({ contact_fields_schema: next })
        .eq("id", equipeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Campos do contato salvos!");
    },
    onError: (e: Error) =>
      toast.error("Erro ao salvar campos do contato: " + e.message),
  });

  return {
    fields: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    upsertFields,
    refetch: query.refetch,
  };
};
