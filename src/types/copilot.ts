export type AutonomyMode = "observe" | "suggest" | "autonomous";

/** Each autonomy mode gets a one-line PT-BR helper text. */
export const AUTONOMY_OPTIONS: {
  value: AutonomyMode;
  label: string;
  helper: string;
}[] = [
  {
    value: "observe",
    label: "Observar",
    helper: "Observa e propõe, não escreve",
  },
  {
    value: "suggest",
    label: "Sugerir",
    helper: "Prepara a ação e pede sua aprovação",
  },
  {
    value: "autonomous",
    label: "Autônomo",
    helper: "Age sozinho (pausa só em ações de alto risco)",
  },
];

export interface CopilotAgent {
  id: string;
  equipe_id: string;
  scope: "chat" | "contact_base" | "pipeline";
  pipeline_id: string | null;
  name: string;
  system_prompt: string | null;
  autonomy_mode: AutonomyMode;
  created_at?: string;
  updated_at?: string;
}
