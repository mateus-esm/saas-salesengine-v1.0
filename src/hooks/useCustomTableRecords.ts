import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// custom_table_records lags in generated types; scope is enforced via RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface CustomTableRecord {
  id: string;
  equipe_id: string;
  table_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Sprint 5.3 T15 — records for a single custom table.
 *
 * Pass the parent `tableId`; the hook returns its rows and the mutations to
 * create/update/delete them. Row payloads are free-form JSONB keyed by the
 * parent table's `table_schema` column keys.
 */
export const useCustomTableRecords = (tableId: string | null) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;
  const key = ["custom_table_records", tableId];

  const recordsQuery = useQuery({
    queryKey: key,
    enabled: !!tableId,
    queryFn: async (): Promise<CustomTableRecord[]> => {
      const { data, error } = await sb
        .from("custom_table_records")
        .select("*")
        .eq("table_id", tableId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomTableRecord[];
    },
  });

  const createRecord = useMutation({
    mutationFn: async (rowData: Record<string, unknown>) => {
      if (!equipeId) throw new Error("No equipe_id");
      if (!tableId) throw new Error("No table_id");
      const { data, error } = await sb
        .from("custom_table_records")
        .insert({ equipe_id: equipeId, table_id: tableId, data: rowData })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Registro criado");
    },
    onError: (error: Error) => toast.error("Erro ao criar registro: " + error.message),
  });

  const updateRecord = useMutation({
    mutationFn: async ({ id, data: rowData }: { id: string; data: Record<string, unknown> }) => {
      const { data, error } = await sb
        .from("custom_table_records")
        .update({ data: rowData })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Registro atualizado");
    },
    onError: (error: Error) => toast.error("Erro ao atualizar registro: " + error.message),
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("custom_table_records")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Registro removido");
    },
    onError: (error: Error) => toast.error("Erro ao remover registro: " + error.message),
  });

  return {
    records: recordsQuery.data ?? [],
    isLoading: recordsQuery.isLoading,
    error: recordsQuery.error,
    createRecord,
    updateRecord,
    deleteRecord,
    refetch: recordsQuery.refetch,
  };
};
