// src/pages/CopilotCockpit.tsx
//
// Sprint 6.8 W1.1 — Copilot Cockpit: sidebar + detail view layout.
// Replaces the previous tab-based layout with a sidebar navigation.
// Gated behind equipe.is_crm_agent_enabled.

import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCopilotAgents } from "@/hooks/useCopilotAgents";
import { usePipelines } from "@/hooks/usePipelines";
import { CopilotConfigCard } from "@/components/crm/copilot/CopilotConfigCard";
import CopilotTrainingPanel from "@/components/crm/copilot/CopilotTrainingPanel";
import { CopilotApprovalsPanel } from "@/components/crm/copilot/CopilotApprovalsPanel";
import { PipelineAgentView } from "@/components/crm/copilot/PipelineAgentView";
import { ControlRoom } from "@/components/crm/copilot/ControlRoom";
import {
  CopilotSidebar,
  type SidebarItem,
} from "@/components/crm/copilot/CopilotSidebar";
import type { AutonomyMode } from "@/types/copilot";

const CopilotCockpit = () => {
  const { equipe, refreshEquipe } = useAuth();
  const { agents, isLoading: agentsLoading, upsert, syncToggleToAgents } = useCopilotAgents();
  const { activePipelines, isLoading: pipelinesLoading } = usePipelines();
  const [selected, setSelected] = useState<SidebarItem | null>(null);

  const isLoading = agentsLoading || pipelinesLoading;

  // ── Gate: feature flag not enabled ────────────────────────
  if (!equipe?.is_crm_agent_enabled) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b border-border bg-header-bg">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-foreground">Copilot</h1>
            <p className="text-sm text-foreground/70 mt-1 font-medium">
              Central de operação, treinamento e auditoria dos agentes.
            </p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold text-foreground">
              Agente de CRM inativo
            </h2>
            <p className="text-sm text-muted-foreground">
              Ative o Agente de CRM nas configurações da equipe para configurar
              e usar o time de copilotos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Helpers ───────────────────────────────────────────────
  const findAgent = (
    scope: "chat" | "contact_base" | "pipeline",
    pipeline_id: string | null,
  ) =>
    agents.find(
      (a) =>
        a.scope === scope &&
        (pipeline_id === null
          ? a.pipeline_id === null
          : a.pipeline_id === pipeline_id),
    );

  const makeSaveHandler =
    (
      scope: "chat" | "contact_base" | "pipeline",
      pipeline_id: string | null,
    ) =>
    async (patch: {
      name: string;
      system_prompt: string | null;
      autonomy_mode: AutonomyMode;
    }) => {
      await upsert.mutateAsync({ scope, pipeline_id, ...patch });
      // Sync the AI toggle to match the new agent mode consensus
      await syncToggleToAgents();
      await refreshEquipe();
    };

  const contactAgent = findAgent("contact_base", null);

  // ── Right panel renderer ──────────────────────────────────
  const renderDetail = () => {
    if (selected === null) {
      return (
        <div className="p-6">
          <ControlRoom
            pipelines={activePipelines}
            showAgentFilter
            showTypeFilter
          />
        </div>
      );
    }

    // Contact Base agent config
    if (selected === "contact_base") {
      return (
        <div className="p-6">
          <CopilotConfigCard
            agent={
              contactAgent ?? {
                scope: "contact_base",
                pipeline_id: null,
              }
            }
            title="Base de Contatos"
            subtitle="Enriquece e organiza seus contatos automaticamente"
            trainingLabel="Treinamento"
            trainingPlaceholder="Descreva em linguagem natural o que o agente deve fazer..."
            onSave={makeSaveHandler("contact_base", null)}
          />
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            O modo <strong>Copilot</strong> sugere ações que você revisa antes de aplicar.
            O modo <strong>Autopilot</strong> executa automaticamente as ações de enriquecimento
            e organização dos contatos.
          </p>
        </div>
      );
    }

    // Pipeline detail view
    if (typeof selected === "object" && selected.type === "pipeline") {
      const pipeline = activePipelines.find((p) => p.id === selected.id);
      if (!pipeline) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Pipeline não encontrada
            </p>
          </div>
        );
      }

      const agent = findAgent("pipeline", pipeline.id);
      return (
        <PipelineAgentView
          pipeline={pipeline}
          agent={
            agent ?? {
              scope: "pipeline",
              pipeline_id: pipeline.id,
            }
          }
          onBack={() => setSelected(null)}
          onSave={makeSaveHandler("pipeline", pipeline.id)}
        />
      );
    }

    // Training panel
    if (selected === "training") {
      return (
        <div className="p-6">
          <CopilotTrainingPanel />
        </div>
      );
    }

    // Approvals panel
    if (selected === "approvals") {
      return (
        <div className="p-6 space-y-4">
          {activePipelines.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Nenhum pipeline ativo.
            </p>
          )}
          {activePipelines.map((pipeline) => (
            <section key={pipeline.id} className="space-y-2">
              <h3 className="text-sm font-medium">{pipeline.name}</h3>
              <CopilotApprovalsPanel pipelineId={pipeline.id} />
            </section>
          ))}
        </div>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {/* Page header */}
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">Copilot</h1>
          <p className="text-sm text-foreground/70 mt-1 font-medium">
            Central de operação, treinamento e auditoria dos agentes.
          </p>
        </div>
      </div>

      {/* Sidebar + Detail layout */}
      <div className="flex-1 flex overflow-hidden">
        <CopilotSidebar
          pipelines={activePipelines}
          selected={selected}
          onSelect={setSelected}
        />
        <main className="flex-1 overflow-y-auto bg-background">
          {renderDetail()}
        </main>
      </div>
    </div>
  );
};

export default CopilotCockpit;
