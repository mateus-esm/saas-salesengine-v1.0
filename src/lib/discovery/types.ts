// Sprint 8.2 · discovery_q&a — o formato do banco de perguntas.
//
// Espelha public.discovery_questions coluna a coluna de propósito: o banco de
// perguntas é a fonte, e o front não inventa campo nenhum em cima dele.

export type QuestionType = "text" | "textarea" | "select" | "select_other" | "multi";
export type MapsTo = "agent" | "crm" | "channels" | "team";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface DiscoveryQuestion {
  code: string;
  block: string;
  block_label: string;
  sort_order: number;
  label: string;
  help: string | null;
  type: QuestionType;
  options: QuestionOption[];
  default_value: unknown;
  required: boolean;
  maps_to: MapsTo;
  niche_id: string | null;
  /** Só para `multi`: o teto de escolhas (o tom do agente aceita 3). */
  max_select: number | null;
}

export type DiscoveryAnswers = Record<string, unknown>;

export interface DiscoveryBlock {
  id: string;
  label: string;
  questions: DiscoveryQuestion[];
}

export interface DiscoveryDocument {
  cliente_nome: string;
  status: "draft" | "submitted";
  progress: number;
  answers: DiscoveryAnswers;
  link_agenda: string;
  questions: DiscoveryQuestion[];
}
