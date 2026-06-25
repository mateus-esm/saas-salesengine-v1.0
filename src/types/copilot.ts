export type AutonomyMode = "observe" | "suggest" | "autonomous";

/** UI-facing display modes (2-mode abstraction over 3-value DB enum) */
export type DisplayMode = "copilot" | "autopilot";

/** Map DB value → display mode */
export function toDisplayMode(mode: AutonomyMode): DisplayMode {
  if (mode === "autonomous") return "autopilot";
  return "copilot"; // observe + suggest → copilot
}

/** Map display mode → DB value (the one to persist) */
export function toDbMode(mode: DisplayMode): AutonomyMode {
  if (mode === "autopilot") return "autonomous";
  return "suggest";
}

/** Display-mode options for the UI */
export const DISPLAY_OPTIONS: { value: DisplayMode; label: string; helper: string }[] = [
  {
    value: "copilot",
    label: "Copilot",
    helper: "Pergunta antes de agir; você aprova ou sincroniza",
  },
  {
    value: "autopilot",
    label: "Autopilot",
    helper: "Age sozinho; só pausa em ações de alto risco",
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
