// Sprint 11 · Onda 4 · T44 — the automation buttons of an artifact table.
//
// Configure (crm_save_artifact_actions: label + URL, each one a webhook of the
// outbound queue), click (crm_run_artifact_action: the record goes to the
// automation with a callback token) and follow the runs of a record until the
// automation answers.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { isRunWaiting, type ArtifactActionDraft, type ArtifactRun } from "@/lib/artifactActions";

const sb = supabase as any;

export const artifactActionKeys = {
  config: (tableId: string) => ["artifact_actions", tableId] as const,
  runs: (recordId: string | null) => ["artifact_action_runs", recordId] as const,
};

/** The table's actions with their URLs (for the editor). */
export function useArtifactActionsConfig(tableId: string, enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: artifactActionKeys.config(tableId),
    enabled,
    queryFn: async (): Promise<ArtifactActionDraft[]> => {
      const { data, error } = await sb.rpc("crm_artifact_actions", { p_table_id: tableId });
      if (error) throw error;
      return (data ?? []) as ArtifactActionDraft[];
    },
  });

  const save = useMutation({
    mutationFn: async (actions: ArtifactActionDraft[]) => {
      const { data, error } = await sb.rpc("crm_save_artifact_actions", {
        p_table_id: tableId,
        p_actions: actions.map((a) => ({ ...(a.id ? { id: a.id } : {}), label: a.label.trim(), url: a.url.trim() })),
      });
      if (error) throw error;
      return (data ?? []) as ArtifactActionDraft[];
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(artifactActionKeys.config(tableId), saved);
      void queryClient.invalidateQueries({ queryKey: ["custom_tables"] });
      void queryClient.invalidateQueries({ queryKey: ["deal_artifacts"] });
      toast.success("Ações salvas");
    },
    onError: (error: Error) => toast.error("Erro ao salvar as ações: " + error.message),
  });

  return { actions: query.data ?? [], isLoading: query.isLoading, save };
}

export function useRunArtifactAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, actionId }: { recordId: string; actionId: string; label: string }) => {
      const { data, error } = await sb.rpc("crm_run_artifact_action", { p_record_id: recordId, p_action_id: actionId });
      if (error) throw error;
      return data as { run_id: string; status: string };
    },
    onSuccess: (_r, { recordId, label }) => {
      void queryClient.invalidateQueries({ queryKey: artifactActionKeys.runs(recordId) });
      toast.success(`Enviado: ${label}`);
    },
    onError: (error: Error) => toast.error("Não foi possível enviar: " + error.message),
  });
}

/**
 * The last runs of a record. While one waits for the automation, it asks again
 * every few seconds — and when it finishes, the record (status, fields, files)
 * is read again.
 */
export function useArtifactRuns(recordId: string | null, tableId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: artifactActionKeys.runs(recordId),
    enabled: enabled && !!recordId,
    queryFn: async (): Promise<ArtifactRun[]> => {
      const { data, error } = await sb
        .from("artifact_action_runs")
        .select("id, action_label, status, created_at, finished_at, expires_at, result")
        .eq("record_id", recordId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      const runs = (data ?? []) as ArtifactRun[];
      const previous = queryClient.getQueryData<ArtifactRun[]>(artifactActionKeys.runs(recordId)) ?? [];
      const answered = runs.some((r) => {
        const before = previous.find((p) => p.id === r.id);
        return !!before && JSON.stringify(before.result) !== JSON.stringify(r.result);
      });
      if (answered && tableId) {
        void queryClient.invalidateQueries({ queryKey: ["custom_table_records", tableId] });
        void queryClient.invalidateQueries({ queryKey: ["deal_artifacts"] });
      }
      return runs;
    },
    refetchInterval: (query) => {
      const runs = (query.state.data as ArtifactRun[] | undefined) ?? [];
      const recent = runs.some(
        (r) => isRunWaiting(r) && Date.now() - new Date(r.created_at).getTime() < 15 * 60 * 1000,
      );
      return recent ? 5000 : false;
    },
  });
}
