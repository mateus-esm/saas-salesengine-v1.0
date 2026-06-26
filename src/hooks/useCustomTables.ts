import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// custom_tables lags in generated types; scope is enforced via equipe_id + RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface CustomTableColumn {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select" | "relation";
  options?: string[];
  relationConfig?: {
    targetTable: string;
    targetTableSlug: string;
    /** UUID of the target custom table (used to query custom_table_records). */
    targetTableId?: string;
    displayField: string;
  };
}

export interface CustomTable {
  id: string;
  equipe_id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  table_schema: CustomTableColumn[];
  created_at: string;
  updated_at: string;
}

interface CreateCustomTableData {
  name: string;
  slug: string;
  icon?: string | null;
  description?: string | null;
  table_schema?: CustomTableColumn[];
}

interface UpdateCustomTableData {
  id: string;
  name?: string;
  slug?: string;
  icon?: string | null;
  description?: string | null;
  table_schema?: CustomTableColumn[];
}

/**
 * Sprint 5.3 T15 — Personalized Tables foundation.
 *
 * CRUD over `custom_tables` (team-scoped metadata for Jestor/Airtable-style
 * custom table definitions). No builder UI yet — this hook is the data layer
 * future sprints will drive the visual schema editor from.
 */
export const useCustomTables = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const tablesQuery = useQuery({
    queryKey: ["custom_tables", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<CustomTable[]> => {
      const { data, error } = await sb
        .from("custom_tables")
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        table_schema: (r.table_schema as CustomTableColumn[] | null) ?? [],
      })) as CustomTable[];
    },
  });

  const createTable = useMutation({
    mutationFn: async (input: CreateCustomTableData) => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from("custom_tables")
        .insert({
          equipe_id: equipeId,
          name: input.name,
          slug: input.slug,
          icon: input.icon ?? null,
          description: input.description ?? null,
          table_schema: input.table_schema ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_tables", equipeId] });
      toast.success("Tabela criada");
    },
    onError: (error: Error) => toast.error("Erro ao criar tabela: " + error.message),
  });

  const updateTable = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateCustomTableData) => {
      const { data, error } = await sb
        .from("custom_tables")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_tables", equipeId] });
      toast.success("Tabela atualizada");
    },
    onError: (error: Error) => toast.error("Erro ao atualizar tabela: " + error.message),
  });

  // Soft delete — keeps records and respects the partial unique index on slug.
  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("custom_tables")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_tables", equipeId] });
      toast.success("Tabela removida");
    },
    onError: (error: Error) => toast.error("Erro ao remover tabela: " + error.message),
  });

  return {
    tables: tablesQuery.data ?? [],
    isLoading: tablesQuery.isLoading,
    error: tablesQuery.error,
    createTable,
    updateTable,
    deleteTable,
    refetch: tablesQuery.refetch,
  };
};
