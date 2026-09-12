// Sprint 11 · Onda 4 · T43 — changing an artifact's status (crm_set_artifact_status).
//
// The status proves the deal's milestone: a proposal sent can move the deal to
// the stage that declares it. So a change refreshes the artifact lists and, when
// the deal moved, the views that show the deal's stage (board, table, contacts).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { milestoneLabel, type ArtifactStatus } from "@/lib/artifacts";

import type { CustomTableRecord } from "./useCustomTableRecords";

const sb = supabase as any;

export interface ArtifactStatusResult {
  record: CustomTableRecord;
  moved: boolean;
  /** The stage the deal moved to, when it moved. */
  stage_id: string | null;
  /** The milestone recorded (by the stage or directly), if any. */
  event: string | null;
}

export function useSetArtifactStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recordId, status }: { recordId: string; status: ArtifactStatus }) => {
      const { data, error } = await sb.rpc("crm_set_artifact_status", { p_record_id: recordId, p_status: status });
      if (error) throw error;
      return data as ArtifactStatusResult;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["deal_artifacts"] });
      void queryClient.invalidateQueries({ queryKey: ["custom_table_records", result.record.table_id] });
      if (result.moved) {
        void queryClient.invalidateQueries({ queryKey: ["board"] });
        void queryClient.invalidateQueries({ queryKey: ["opp_table"] });
        void queryClient.invalidateQueries({ queryKey: ["contacts_table"] });
      }
      const milestone = milestoneLabel(result.event);
      if (milestone) toast.success(result.moved ? `Negócio movido: ${milestone}` : `Marco registrado: ${milestone}`);
    },
    onError: (error: Error) => toast.error("Erro ao mudar o status: " + error.message),
  });
}
