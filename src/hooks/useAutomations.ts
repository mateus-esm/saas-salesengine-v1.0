// Sprint Suporte 1 · Onda 5 — automações (evento -> ação), suas execuções, as etapas
// da equipe (para escolher destino e mostrar a origem dos webhooks) e o reenvio.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { StageLink } from "@/lib/webhookCatalog";
import type { WebhookConfig } from "@/types/webhook";

export interface AutomationTrigger {
  event: "stage_entered" | "webhook_received" | "button_clicked";
  stage_id?: string;
  webhook_id?: string;
  button_id?: string;
}
export interface AutomationAction {
  type: "move_stage" | "update_field" | "set_responsible" | "call_webhook";
  params: Record<string, unknown>;
}
export interface CrmAutomation {
  id: string;
  equipe_id: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  enabled: boolean;
  created_at: string;
}
export interface AutomationRun {
  id: string;
  automation_id: string | null;
  opportunity_id: string | null;
  status: "running" | "ok" | "error" | "skipped";
  error: string | null;
  input: Record<string, unknown>;
  created_at: string;
}

// As tabelas novas ainda não estão nos tipos gerados do Supabase.
const db = supabase as any;

export function useAutomations() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const qc = useQueryClient();
  const key = ["crm-automations", equipeId];

  const list = useQuery({
    queryKey: key,
    enabled: !!equipeId,
    queryFn: async () => {
      const { data, error } = await db.from("crm_automations").select("*").eq("equipe_id", equipeId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmAutomation[];
    },
  });

  const create = useMutation({
    mutationFn: async (a: { name: string; trigger: AutomationTrigger; action: AutomationAction }) => {
      const { error } = await db.from("crm_automations").insert({ ...a, equipe_id: equipeId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Automação criada"); },
    onError: (e: Error) => toast.error("Erro ao criar automação: " + e.message),
  });

  const toggle = useMutation({
    mutationFn: async (a: CrmAutomation) => {
      const { error } = await db.from("crm_automations").update({ enabled: !a.enabled, updated_at: new Date().toISOString() }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error("Erro ao atualizar automação: " + e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("crm_automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error("Erro ao remover automação: " + e.message),
  });

  return { automations: list.data ?? [], isLoading: list.isLoading, create, toggle, remove };
}

export function useAutomationRuns(limit = 100) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const q = useQuery({
    queryKey: ["automation-runs", equipeId, limit],
    enabled: !!equipeId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db.from("automation_runs").select("*").eq("equipe_id", equipeId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as AutomationRun[];
    },
  });
  return { runs: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Etapas da equipe com o nome do pipeline. webhook_triggers só existe depois da
 * SE-STAGEHOOK-001: sem a coluna a consulta cai para o select simples e a tela
 * segue sem o vínculo etapa -> webhook (a convenção textual do trigger_event cobre o resto).
 */
export function useTeamStages() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const q = useQuery({
    queryKey: ["team-stages", equipeId],
    enabled: !!equipeId,
    staleTime: 60_000,
    queryFn: async (): Promise<StageLink[]> => {
      const run = (cols: string) =>
        db.from("pipeline_stages_v2").select(cols).eq("equipe_id", equipeId).is("deleted_at", null).order("position");
      let res = await run("id, name, pipeline_id, webhook_triggers");
      if (res.error) res = await run("id, name, pipeline_id");
      if (res.error) throw res.error;
      const { data: pipes } = await db.from("pipelines").select("id, name").eq("equipe_id", equipeId);
      const names = new Map<string, string>((pipes ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
      return (res.data ?? []).map((s: StageLink & { pipeline_id: string }) => ({
        id: s.id, name: s.name, pipeline_name: names.get(s.pipeline_id), webhook_triggers: s.webhook_triggers ?? null,
      }));
    },
  });
  return { stages: q.data ?? [], isLoading: q.isLoading };
}

/** Webhooks dos botões das tabelas (artifact_action:*): a lista principal os esconde, aqui só se mostram. */
export function useButtonWebhooks() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const q = useQuery({
    queryKey: ["button-webhooks", equipeId],
    enabled: !!equipeId,
    queryFn: async () => {
      const { data, error } = await db.from("webhook_configs").select("*").eq("equipe_id", equipeId).like("trigger_event", "artifact_action:%");
      if (error) throw error;
      return (data ?? []) as WebhookConfig[];
    },
  });
  return q.data ?? [];
}

/** Reenvia uma entrega de saída que falhou: cria a nova linha de log e aciona o despachante de sempre. */
export function useResendDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logId: string) => {
      const { data, error } = await db.rpc("resend_webhook_delivery", { p_log: logId });
      if (error) throw error;
      const { error: invokeError } = await supabase.functions.invoke("deliver-crm-webhook", {
        body: { operation: "deliver_outbound", log_id: data.log_id, dispatch_token: data.dispatch_token },
      });
      if (invokeError) throw invokeError;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhook-logs"] }); toast.success("Entrega reenviada"); },
    onError: (e: Error) => toast.error("Erro ao reenviar: " + e.message),
  });
}
