// Sprint 11 · Onda 3 · T36 — ready-to-use line models.
//
// A template is deliberately data-only: the creation dialog can persist it
// without the Copilot service, while the same nature/stage contract remains
// reusable by onboarding and future API surfaces.

import { stagesForProcess } from "@/lib/natures";
import type { PipelineNatures } from "@/types/natures";
import type { CatalogKind, PriceMode, RecurrenceUnit } from "@/types/revenue";

export type PipelineTemplateId =
  | "consultive-sale"
  | "clinic-return"
  | "launch"
  | "legal-service";

export interface CatalogSuggestion {
  name: string;
  kind: CatalogKind;
  price_mode: PriceMode;
  recurrence?: {
    every: number;
    unit: RecurrenceUnit;
    renew_days_before: number;
  };
}

export interface PipelineTemplate {
  id: PipelineTemplateId;
  name: string;
  description: string;
  audience: string;
  natures: PipelineNatures;
  stages: ReturnType<typeof stagesForProcess>;
  /** Suggestions only: prices/products are never created without confirmation. */
  catalog_suggestions: CatalogSuggestion[];
}

const template = (
  value: Omit<PipelineTemplate, "stages">,
): PipelineTemplate => ({
  ...value,
  stages: stagesForProcess(value.natures.process),
});

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  template({
    id: "consultive-sale",
    name: "Venda consultiva",
    audience: "Energia solar e projetos técnicos",
    description: "Da qualificação ao contrato, com reunião, proposta e aceite.",
    natures: {
      offer: { mode: "catalog", catalog_item_ids: [] },
      process: {
        mode: "milestones",
        milestones: [
          "qualified",
          "meeting_scheduled",
          "meeting_done",
          "proposal_sent",
          "contract_sent",
          "contract_signed",
        ],
      },
    },
    catalog_suggestions: [
      { name: "Projeto", kind: "service", price_mode: "negotiable" },
      { name: "Equipamentos", kind: "product", price_mode: "negotiable" },
      { name: "Instalação", kind: "service", price_mode: "negotiable" },
    ],
  }),
  template({
    id: "clinic-return",
    name: "Clínica com retorno",
    audience: "Dentistas, clínicas e tratamentos",
    description: "Agenda, atendimento e retorno recorrente do paciente.",
    natures: {
      offer: { mode: "catalog", catalog_item_ids: [] },
      process: {
        mode: "milestones",
        milestones: ["qualified", "meeting_scheduled", "meeting_done", "proposal_sent"],
      },
    },
    catalog_suggestions: [
      { name: "Consulta", kind: "service", price_mode: "fixed" },
      {
        name: "Retorno preventivo",
        kind: "service",
        price_mode: "fixed",
        recurrence: { every: 6, unit: "month", renew_days_before: 15 },
      },
      { name: "Tratamento", kind: "service", price_mode: "negotiable" },
    ],
  }),
  template({
    id: "launch",
    name: "Lançamento",
    audience: "Cinema, eventos e campanhas",
    description: "Captação e negociação concentradas até a confirmação do lançamento.",
    natures: {
      offer: { mode: "catalog", catalog_item_ids: [] },
      process: {
        mode: "milestones",
        milestones: ["qualified", "meeting_scheduled", "proposal_sent", "contract_signed"],
      },
    },
    catalog_suggestions: [
      { name: "Cota de patrocínio", kind: "service", price_mode: "negotiable" },
      { name: "Sessão ou ingresso", kind: "product", price_mode: "fixed" },
      { name: "Ativação de marca", kind: "service", price_mode: "negotiable" },
    ],
  }),
  template({
    id: "legal-service",
    name: "Serviço jurídico",
    audience: "Escritórios e consultorias",
    description: "Triagem, reunião, proposta, contrato e contratação do serviço.",
    natures: {
      offer: { mode: "catalog", catalog_item_ids: [] },
      process: {
        mode: "milestones",
        milestones: [
          "qualified",
          "meeting_scheduled",
          "proposal_sent",
          "contract_sent",
          "contract_signed",
        ],
      },
    },
    catalog_suggestions: [
      { name: "Consulta jurídica", kind: "service", price_mode: "fixed" },
      { name: "Assessoria", kind: "service", price_mode: "negotiable" },
      { name: "Honorários de êxito", kind: "service", price_mode: "negotiable" },
    ],
  }),
];

export function getPipelineTemplate(id: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.find((item) => item.id === id);
}
