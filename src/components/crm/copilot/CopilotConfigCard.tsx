// src/components/crm/copilot/CopilotConfigCard.tsx
//
// Sprint 6 Wave 3 — Reusable config card for each copilot agent (chat, contact_base, pipeline).
// Renders: name input, system-prompt textarea, 3-way autonomy dial, and a Salvar button.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AutonomyMode, CopilotAgent } from "@/types/copilot";

// Each autonomy mode gets a one-line PT-BR helper text.
const AUTONOMY_OPTIONS: {
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

export interface CopilotConfigCardProps {
  /** Existing agent row (may be partial / empty if not yet saved) */
  agent: Partial<CopilotAgent> & {
    scope: CopilotAgent["scope"];
    pipeline_id?: string | null;
  };
  title: string;
  subtitle?: string;
  onSave: (patch: {
    name: string;
    system_prompt: string | null;
    autonomy_mode: AutonomyMode;
  }) => Promise<void>;
}

export function CopilotConfigCard({
  agent,
  title,
  subtitle,
  onSave,
}: CopilotConfigCardProps) {
  const [name, setName] = useState(agent.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt ?? "");
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>(
    agent.autonomy_mode ?? "observe",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || title,
        system_prompt: systemPrompt.trim() || null,
        autonomy_mode: autonomyMode,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && (
          <CardDescription>{subtitle}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor={`name-${agent.scope}-${agent.pipeline_id ?? "global"}`}>
            Nome do Agente
          </Label>
          <Input
            id={`name-${agent.scope}-${agent.pipeline_id ?? "global"}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={title}
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label htmlFor={`prompt-${agent.scope}-${agent.pipeline_id ?? "global"}`}>
            Prompt de Sistema
          </Label>
          <Textarea
            id={`prompt-${agent.scope}-${agent.pipeline_id ?? "global"}`}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Instruções customizadas para este agente (opcional)"
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Autonomy Dial — 3-button segmented control */}
        <div className="space-y-2">
          <Label>Modo de Autonomia</Label>
          <div className="grid grid-cols-3 gap-2">
            {AUTONOMY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAutonomyMode(opt.value)}
                className={[
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  autonomyMode === opt.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent",
                ].join(" ")}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {opt.helper}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
