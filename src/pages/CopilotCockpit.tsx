// src/pages/CopilotCockpit.tsx
//
// Sprint 6.6 — Copilot Cockpit: Setup / Training / Approvals / Logs.
// Central de operacao, treinamento e auditoria dos agentes.
// Gated behind equipe.is_crm_agent_enabled.

import { Bot, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCopilotAgents } from "@/hooks/useCopilotAgents";
import { usePipelines } from "@/hooks/usePipelines";
import { CopilotConfigCard } from "@/components/crm/copilot/CopilotConfigCard";
import { ControlRoom } from "@/components/crm/copilot/ControlRoom";
import CopilotTrainingPanel from "@/components/crm/copilot/CopilotTrainingPanel";
import { CopilotApprovalsPanel } from "@/components/crm/copilot/CopilotApprovalsPanel";
import { PipelineCockpitAccordion } from "@/components/crm/copilot/PipelineCockpitAccordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AutonomyMode } from "@/types/copilot";

const CopilotCockpit = () => {
  const { equipe } = useAuth();
  const { agents, isLoading: agentsLoading, upsert } = useCopilotAgents();
  const { activePipelines, isLoading: pipelinesLoading } = usePipelines();

  const isLoading = agentsLoading || pipelinesLoading;

  // Gate: feature flag not enabled
  if (!equipe?.is_crm_agent_enabled) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b border-border bg-header-bg">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-foreground">
              Copilot
            </h1>
            <p className="text-sm text-foreground/70 mt-1 font-medium">
              Central de operacao, treinamento e auditoria dos agentes.
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
              Ative o Agente de CRM nas configurações da equipe para configurar e
              usar o time de copilotos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Helper: find the existing agent row for a given scope + pipeline_id
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

  // onSave factory — builds a upsert call for a given scope + pipeline_id
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
    };

  const chatAgent = findAgent("chat", null);
  const contactAgent = findAgent("contact_base", null);

  return (
    <div className="flex-1 flex flex-col">
      {/* Page header */}
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            Copilot
          </h1>
          <p className="text-sm text-foreground/70 mt-1 font-medium">
            Central de operacao, treinamento e auditoria dos agentes.
          </p>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6">
        <Tabs defaultValue="setup" className="space-y-6">
          <TabsList>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
            <TabsTrigger value="training">Treinamento</TabsTrigger>
            <TabsTrigger value="approvals">Aprovacoes</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
        {/* Global copilots */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Agentes Globais
          </h2>
          <p className="text-sm text-muted-foreground">
            Estes agentes atuam em toda a plataforma, independente do pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CopilotConfigCard
            agent={
              chatAgent ?? {
                scope: "chat",
                pipeline_id: null,
              }
            }
            title="🗗 Chat Copilot"
            subtitle="Auxilia nas conversas do chat com seus leads"
            onSave={makeSaveHandler("chat", null)}
          />

          <CopilotConfigCard
            agent={
              contactAgent ?? {
                scope: "contact_base",
                pipeline_id: null,
              }
            }
            title="📇 Base de Contatos"
            subtitle="Enriquece e organiza seus contatos automaticamente"
            onSave={makeSaveHandler("contact_base", null)}
          />
        </div>

        {/* Per-pipeline copilots */}
        {activePipelines.length > 0 && (
          <>
            <div className="space-y-2 pt-2">
              <h2 className="text-lg font-semibold text-foreground">
                Agentes por Pipeline
              </h2>
              <p className="text-sm text-muted-foreground">
                Cada pipeline pode ter um copiloto com comportamento especializado.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activePipelines.map((pipeline) => {
                const agent = findAgent("pipeline", pipeline.id);
                return (
                  <CopilotConfigCard
                    key={pipeline.id}
                    agent={
                      agent ?? {
                        scope: "pipeline",
                        pipeline_id: pipeline.id,
                      }
                    }
                    title={`🏭 ${pipeline.name}`}
                    subtitle={
                      pipeline.description ?? "Configure o copiloto para este pipeline"
                    }
                    onSave={makeSaveHandler("pipeline", pipeline.id)}
                  />
                );
              })}
            </div>
          </>
        )}

        {activePipelines.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Nenhum pipeline ativo encontrado. Crie pipelines em Configuracoes para
            adicionar copilotos especializados.
          </p>
        )}
          </TabsContent>

          <TabsContent value="pipelines" className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">
                Painel por Pipeline
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure metas, prompt, automacoes e acompanhe logs de cada
                pipeline individualmente.
              </p>
            </div>
            <PipelineCockpitAccordion />
          </TabsContent>

          <TabsContent value="training">
            <CopilotTrainingPanel />
          </TabsContent>

          <TabsContent value="approvals" className="space-y-4">
            {activePipelines.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum pipeline ativo.</p>
            )}
            {activePipelines.map((pipeline) => (
              <section key={pipeline.id} className="space-y-2">
                <h3 className="text-sm font-medium">{pipeline.name}</h3>
                <CopilotApprovalsPanel pipelineId={pipeline.id} />
              </section>
            ))}
          </TabsContent>

          <TabsContent value="logs">
            <ControlRoom pipelines={activePipelines} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CopilotCockpit;
