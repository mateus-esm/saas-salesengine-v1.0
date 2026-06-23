// src/components/crm/copilot/PipelineAgentView.tsx
//
// Sprint 6.8 W1.1 — Per-pipeline detail view with collapsible
// accordion boxes: prompt config, automations, agentic work,
// logs, and revenue goals.

import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  Brain,
  Cog,
  DollarSign,
  FileText,
  Loader2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ControlRoom } from "@/components/crm/copilot/ControlRoom";
import { RevenueGoalsForm } from "@/components/crm/revenue/RevenueGoalsForm";
import type { Pipeline } from "@/types/pipelines";
import { AUTONOMY_OPTIONS } from "@/types/copilot";
import type { AutonomyMode, CopilotAgent } from "@/types/copilot";

// ── Props ───────────────────────────────────────────────────────
interface PipelineAgentViewProps {
  pipeline: Pipeline;
  agent: Partial<CopilotAgent> & { scope: "pipeline"; pipeline_id: string };
  onBack: () => void;
  onSave: (patch: {
    name: string;
    system_prompt: string | null;
    autonomy_mode: AutonomyMode;
  }) => Promise<void>;
}

// ── Component ───────────────────────────────────────────────────
export function PipelineAgentView({
  pipeline,
  agent,
  onBack,
  onSave,
}: PipelineAgentViewProps) {
  const [name, setName] = useState(agent.name ?? pipeline.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt ?? "");
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>(
    agent.autonomy_mode ?? "observe",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || pipeline.name,
        system_prompt: systemPrompt.trim() || null,
        autonomy_mode: autonomyMode,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── Header with back button ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="h-4 w-px bg-border" />
        <h2 className="text-lg font-semibold text-foreground">
          {pipeline.name}
        </h2>
      </div>

      {/* ── Accordion content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <Accordion
          type="single"
          collapsible
          defaultValue="prompt"
          className="space-y-3"
        >
          {/* ── Prompt & Base de Conhecimento ── */}
          <AccordionItem
            value="prompt"
            className="border rounded-lg overflow-hidden bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span>Prompt & Base de Conhecimento</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`agent-name-${pipeline.id}`}>
                    Nome do Agente
                  </Label>
                  <Input
                    id={`agent-name-${pipeline.id}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={pipeline.name}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`agent-prompt-${pipeline.id}`}>
                    Prompt de Sistema
                  </Label>
                  <Textarea
                    id={`agent-prompt-${pipeline.id}`}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Instruções customizadas para este agente (opcional)"
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {saving && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Salvar
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Automações Determinísticas ── */}
          <AccordionItem
            value="automations"
            className="border rounded-lg overflow-hidden bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cog className="h-4 w-4 text-primary shrink-0" />
                <span>Automações Determinísticas</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
              <p className="text-sm text-muted-foreground italic">Em breve</p>
            </AccordionContent>
          </AccordionItem>

          {/* ── Trabalho Agêntico ── */}
          <AccordionItem
            value="agentic"
            className="border rounded-lg overflow-hidden bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Brain className="h-4 w-4 text-primary shrink-0" />
                <span>Trabalho Agêntico</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
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
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  size="sm"
                  className="w-full sm:w-auto mt-2"
                >
                  {saving && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Salvar
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Logs ── */}
          <AccordionItem
            value="logs"
            className="border rounded-lg overflow-hidden bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary shrink-0" />
                <span>Logs</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
              <ControlRoom pipelines={[pipeline]} />
            </AccordionContent>
          </AccordionItem>

          {/* ── Receita & Metas ── */}
          <AccordionItem
            value="revenue"
            className="border rounded-lg overflow-hidden bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4 text-primary shrink-0" />
                <span>Receita & Metas</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
              <RevenueGoalsForm pipelineId={pipeline.id} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
