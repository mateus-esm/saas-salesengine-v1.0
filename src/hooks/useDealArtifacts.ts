// Sprint 11 · Onda 4 · T40 — the artifacts a deal holds (proposals, contracts,
// documents): every artifact table of the team, with the records of this deal.
//
// Loaded only while the deal is open. Creating goes through the verb
// (crm_create_artifact: held by the deal, a draft, only the table's columns);
// editing a record is the same write as in the table.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { isArtifactKind } from "@/lib/artifacts";
import { withFieldIds } from "@/lib/customTables";

import type { CustomTableRecord } from "./useCustomTableRecords";
import type { CustomTable } from "./useCustomTables";

const sb = supabase as any;

export interface DealArtifactGroup {
  table: CustomTable;
  records: CustomTableRecord[];
}

export const dealArtifactKeys = {
  all: ["deal_artifacts"] as const,
  deal: (opportunityId: string | null) => ["deal_artifacts", opportunityId] as const,
};

function toGroup(raw: Record<string, unknown>): DealArtifactGroup {
  const t = (raw.table ?? {}) as Record<string, unknown>;
  return {
    table: {
      id: t.id as string,
      equipe_id: (t.equipe_id as string) ?? "",
      name: (t.name as string) ?? "",
      slug: (t.slug as string) ?? "",
      icon: null,
      description: null,
      table_schema: withFieldIds(t.table_schema),
      artifact_kind: isArtifactKind(t.artifact_kind) ? t.artifact_kind : null,
      created_at: "",
      updated_at: "",
    },
    records: (Array.isArray(raw.records) ? raw.records : []) as CustomTableRecord[],
  };
}

export function useDealArtifacts(opportunityId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const key = dealArtifactKeys.deal(opportunityId);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!opportunityId,
    queryFn: async (): Promise<DealArtifactGroup[]> => {
      const { data, error } = await sb.rpc("crm_deal_artifacts", { p_opportunity_id: opportunityId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(toGroup);
    },
  });

  const refresh = (tableId: string) => {
    void queryClient.invalidateQueries({ queryKey: key });
    // The table's own lists show the record too.
    void queryClient.invalidateQueries({ queryKey: ["custom_table_records", tableId] });
    void queryClient.invalidateQueries({ queryKey: ["custom_table_count", tableId] });
  };

  const createArtifact = useMutation({
    mutationFn: async ({ tableId, data }: { tableId: string; data?: Record<string, unknown> }) => {
      const { data: row, error } = await sb.rpc("crm_create_artifact", {
        p_table_id: tableId,
        p_opportunity_id: opportunityId,
        p_data: data ?? {},
      });
      if (error) throw error;
      return row as CustomTableRecord;
    },
    onSuccess: (row) => refresh(row.table_id),
    onError: (error: Error) => toast.error("Erro ao criar: " + error.message),
  });

  const updateArtifact = useMutation({
    mutationFn: async ({ id, data }: { id: string; tableId: string; data: Record<string, unknown> }) => {
      const { error } = await sb.from("custom_table_records").update({ data }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, { tableId }) => refresh(tableId),
    onError: (error: Error) => toast.error("Erro ao salvar: " + error.message),
  });

  const deleteArtifact = useMutation({
    mutationFn: async ({ id }: { id: string; tableId: string }) => {
      const { error } = await sb.rpc("crm_delete_custom_records", { p_ids: [id] });
      if (error) throw error;
    },
    onSuccess: (_r, { tableId }) => refresh(tableId),
    onError: (error: Error) => toast.error("Erro ao excluir: " + error.message),
  });

  return {
    groups: query.data ?? [],
    isLoading: query.isLoading,
    createArtifact,
    updateArtifact,
    deleteArtifact,
  };
}
