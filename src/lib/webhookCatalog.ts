// Sprint Suporte 1 · Onda 5 — o que a tela de Webhooks mostra além da lista:
// de onde o webhook é disparado (etapa, botão, evento), o payload de exemplo de
// cada evento e o filtro dos logs. Puro: sem rede, testável.
import { WEBHOOK_TRIGGER_EVENTS, type WebhookConfig, type WebhookLog } from "@/types/webhook";

export interface StageLink {
  id: string;
  name: string;
  pipeline_name?: string;
  /** pipeline_stages_v2.webhook_triggers — [{event:'on_stage_entered', webhook_id}] (ausente até a SE-STAGEHOOK-001 ser aplicada). */
  webhook_triggers?: Array<{ event?: string; webhook_id?: string }> | null;
  stage_type?: string;
  /** Motivos de perda do pipeline da etapa (pipelines.loss_reasons). */
  loss_reasons?: string[];
}

/** Mover para etapa de perda de um pipeline com lista de motivos exige o motivo na ação (mesma regra do mover etapa). */
export function lossReasonMissing(stage: StageLink | undefined, lostReason: unknown): boolean {
  return !!stage && stage.stage_type === "lost" && (stage.loss_reasons?.length ?? 0) > 0 &&
    !String(lostReason ?? "").trim();
}

export interface WebhookOrigin {
  kind: "stage" | "button" | "event";
  label: string;
}

/**
 * Convenção da SE-STAGEHOOK-001: trigger_event = 'stage_entered:<id do webhook>' e a
 * etapa guarda {event:'on_stage_entered', webhook_id}. As duas pontas são lidas; se
 * a etapa não aparece (migration ainda não aplicada, etapa apagada) o webhook segue listado.
 */
export function webhookOrigin(config: WebhookConfig, stages: StageLink[] | undefined): WebhookOrigin {
  const stage = (stages ?? []).find((s) =>
    (s.webhook_triggers ?? []).some((t) => t?.event === "on_stage_entered" && t.webhook_id === config.id));
  if (stage || config.trigger_event.startsWith("stage_entered:")) {
    return { kind: "stage", label: `Etapa ${stage?.name ?? "(não encontrada)"} → ao entrar` };
  }
  if (config.trigger_event.startsWith("artifact_action:")) {
    return { kind: "button", label: `Botão ${config.name} → ao clicar` };
  }
  const found = WEBHOOK_TRIGGER_EVENTS.find((e) => e.value === config.trigger_event);
  return { kind: "event", label: found?.label ?? config.trigger_event };
}

/** Exemplo estático por evento — espelha _crm_deal_won_payload (etapa/botão) e o modelo de lead. */
export function sampleEventPayload(triggerEvent: string): Record<string, unknown> {
  if (triggerEvent === "lead_created" || triggerEvent === "contact_created") {
    return {
      event: triggerEvent,
      created_at: "2026-10-15T14:30:00Z",
      lead: { id: "uuid-do-lead", name: "Maria Souza", email: "maria@exemplo.com", phone: "5511999999999", source: "Formulário", tags: ["hot"], custom_fields: {} },
      opportunity: { id: "uuid-do-negocio", pipeline_id: "uuid-do-pipeline", stage_id: "uuid-da-etapa", value: 5000 },
    };
  }
  return {
    event: "deal_won",
    button: "ganho!",
    source: "rev",
    table_id: "uuid-do-pipeline",
    record_id: "uuid-do-negocio",
    triggered_by: { id: "uuid-do-usuario", name: "Ana Vendedora", email: "ana@empresa.com" },
    data: {
      id: "uuid-do-negocio",
      name: "Maria Souza",
      valor_da_oportunidade: 5000,
      estagio: "Fechado ganho",
      data_de_fechamento: "2026-10-15",
      telefone: "5511999999999",
      email: "maria@exemplo.com",
      fonte: "Formulário",
      observacoes: "Cliente pediu proposta com 3 parcelas",
      pipeline: { id: "uuid-do-pipeline", name: "Vendas" },
      responsavel: { id: "uuid-do-usuario", name: "Ana Vendedora", email: "ana@empresa.com" },
      lead: { id: "uuid-do-lead", name: "Maria Souza", email: "maria@exemplo.com", telefone: "5511999999999", fonte: "Formulário", tags: ["hot"], observacoes: null },
      // Campos do negócio pela key (a mesma usada no mapeamento de entrada).
      campos: { consumo_kwh: 420, cidade: "Campinas" },
      itens: [{ name: "Kit solar 5 kWp", quantity: 1, unit_price: 5000, total: 5000 }],
      artefatos: [{ tabela: "Propostas", tipo: "proposal", id: "uuid-do-registro", status: "approved", campos: { valor_total: 5000 } }],
    },
  };
}

export type LogStatus = "success" | "error" | "pending";

export function logStatus(log: WebhookLog): LogStatus {
  if (log.error_message) return "error";
  if (log.response_status && log.response_status >= 200 && log.response_status < 300) return "success";
  if (log.response_status) return "error";
  return "pending";
}

/** Saída que falhou: é a única que se reenvia (o despachante recria a entrega). */
export function isFailedDelivery(log: WebhookLog): boolean {
  return log.direction === "outbound" && !!log.webhook_config_id && logStatus(log) === "error";
}

export interface LogFilters {
  status?: LogStatus | "";
  event?: string;
  /** yyyy-MM-dd, inclusivo, no fuso local. */
  from?: string;
  to?: string;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function filterWebhookLogs(logs: WebhookLog[], f: LogFilters): WebhookLog[] {
  return logs.filter((l) => {
    if (f.status && logStatus(l) !== f.status) return false;
    if (f.event && l.event_type !== f.event) return false;
    const day = localDay(l.created_at);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}
