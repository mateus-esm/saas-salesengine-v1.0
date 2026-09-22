import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CopilotApprovalsPanel } from "@/components/crm/copilot/CopilotApprovalsPanel";
import { CopilotConfigCard } from "@/components/crm/copilot/CopilotConfigCard";
import { CopilotSidebar, type SidebarItem } from "@/components/crm/copilot/CopilotSidebar";
import CopilotTrainingPanel from "@/components/crm/copilot/CopilotTrainingPanel";
import { ControlRoom } from "@/components/crm/copilot/ControlRoom";
import { PipelineAgentView } from "@/components/crm/copilot/PipelineAgentView";
import { useCopilotAgents } from "@/hooks/useCopilotAgents";
import { usePipelines } from "@/hooks/usePipelines";
import type { AutonomyMode } from "@/types/copilot";

interface CopilotSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Scope = "chat" | "contact_base" | "pipeline";

/**
 * Sprint 11 · Onda 6 · T64 — the Copilot's settings, behind the gear.
 *
 * The configuration that used to be the whole page: per pipeline, the mode
 * (observar · sugerir · autônomo), the prompt and the rules (what it may fill and
 * move, how long it waits after a conversation, how many reads a day); the
 * contact-base agent; training; and the full audit log.
 */
export function CopilotSettingsSheet({ open, onOpenChange }: CopilotSettingsSheetProps) {
  const { agents, isLoading: agentsLoading, upsert } = useCopilotAgents();
  const { activePipelines, isLoading: pipelinesLoading } = usePipelines();
  const [selected, setSelected] = useState<SidebarItem | null>(null);

  const findAgent = (scope: Scope, pipelineId: string | null) =>
    agents.find((a) => a.scope === scope && (pipelineId === null ? a.pipeline_id === null : a.pipeline_id === pipelineId));

  const saveHandler =
    (scope: Scope, pipelineId: string | null) =>
    async (patch: { name: string; system_prompt: string | null; autonomy_mode: AutonomyMode }) => {
      await upsert.mutateAsync({ scope, pipeline_id: pipelineId, ...patch });
    };

  const detail = () => {
    if (selected === null) {
      return <ControlRoom pipelines={activePipelines} showAgentFilter showTypeFilter />;
    }
    if (selected === "contact_base") {
      return (
        <CopilotConfigCard
          agent={findAgent("contact_base", null) ?? { scope: "contact_base", pipeline_id: null }}
          title="Base de Contatos"
          subtitle="Enriquece e organiza seus contatos automaticamente"
          trainingLabel="Treinamento"
          trainingPlaceholder="Descreva em linguagem natural o que o agente deve fazer..."
          onSave={saveHandler("contact_base", null)}
        />
      );
    }
    if (selected === "training") return <CopilotTrainingPanel />;
    if (selected === "approvals") {
      return (
        <div className="space-y-4">
          {activePipelines.map((pipeline) => (
            <section key={pipeline.id} className="space-y-2">
              <h3 className="text-sm font-medium">{pipeline.name}</h3>
              <CopilotApprovalsPanel pipelineId={pipeline.id} variant="inline" />
            </section>
          ))}
        </div>
      );
    }
    if (typeof selected === "object" && selected.type === "pipeline") {
      const pipeline = activePipelines.find((p) => p.id === selected.id);
      if (!pipeline) return <p className="text-sm text-muted-foreground">Pipeline não encontrada</p>;
      const agent = findAgent("pipeline", pipeline.id);
      return (
        <PipelineAgentView
          pipeline={pipeline}
          agent={{ ...agent, scope: "pipeline" as const, pipeline_id: pipeline.id }}
          onBack={() => setSelected(null)}
          onSave={saveHandler("pipeline", pipeline.id)}
        />
      );
    }
    return null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-5xl">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>Configurações do Copilot</SheetTitle>
          <SheetDescription>
            Por linha: observar, sugerir ou autônomo; o que ele pode preencher e mover; quanto espera e quantas leituras por dia.
          </SheetDescription>
        </SheetHeader>
        {agentsLoading || pipelinesLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <CopilotSidebar pipelines={activePipelines} selected={selected} onSelect={setSelected} />
            <main className="min-w-0 flex-1 overflow-y-auto p-6">{detail()}</main>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
