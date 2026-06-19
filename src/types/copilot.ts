export type AutonomyMode = "observe" | "suggest" | "autonomous";

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
