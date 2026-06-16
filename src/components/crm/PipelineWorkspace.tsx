import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, LayoutGrid, Table2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePipelines } from "@/hooks/usePipelines";
import { useCopilotRealtime } from "@/hooks/useCopilotRealtime";

import { AgentRulesPanel } from "./AgentRulesPanel";
import { CopilotApprovalsPanel } from "./copilot/CopilotApprovalsPanel";
import { SyncButton } from "./copilot/SyncButton";
import { OpportunityKanban } from "./OpportunityKanban";
import { OpportunityTable } from "./OpportunityTable";
import { PipelineSelector } from "./PipelineSelector";

export type PipelineView = "kanban" | "leads" | "agent";

const PIPELINE_VIEWS: PipelineView[] = ["kanban", "leads", "agent"];
const isPipelineView = (v: string | null): v is PipelineView =>
  !!v && PIPELINE_VIEWS.includes(v as PipelineView);

interface PipelineWorkspaceProps {
  pipelineId: string;
}

/**
 * Sprint 4 EPIC 2 — the per-pipeline workspace.
 *
 * Three tabs live inside a selected pipeline: Kanban, Leads (the database of
 * opportunities for this pipeline), and Agente CRM (Epic 5 placeholder).
 *
 * URL contract: `?view=kanban|leads|agent` survives reload and is shareable
 * alongside `?pipeline=<id>`. Default is `kanban` when the param is missing.
 */
export const PipelineWorkspace = ({ pipelineId }: PipelineWorkspaceProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pipelines } = usePipelines();

  // F2 + F4: subscribe to Realtime on opportunities + ai_decisions for this
  // pipeline so React Query caches stay live without a full-page refresh.
  useCopilotRealtime(pipelineId);

  const view: PipelineView = useMemo(() => {
    const raw = searchParams.get("view");
    return isPipelineView(raw) ? raw : "kanban";
  }, [searchParams]);

  const pipelineName = pipelines.find((p) => p.id === pipelineId)?.name;

  const setView = useCallback(
    (next: string) => {
      if (!isPipelineView(next)) return;
      const params = new URLSearchParams(searchParams);
      params.set("view", next);
      // Clear any deep-linked opportunity id when switching tabs — opening a
      // card is a transient state and shouldn't bleed across views.
      if (params.has("opp")) params.delete("opp");
      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <PipelineSelector />
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="kanban" className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="leads" className="flex items-center gap-2">
                <Table2 className="h-4 w-4" />
                Leads
              </TabsTrigger>
              <TabsTrigger value="agent" className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Agente CRM
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* E4: Global Pipeline Sweep ⚡ — only the kanban view, with credit confirm */}
        {view === "kanban" && (
          <SyncButton mode="sweep" variant="header" pipelineId={pipelineId} />
        )}
      </div>

      {/* F4: Approval cards — renders only when there are pending decisions */}
      <CopilotApprovalsPanel pipelineId={pipelineId} />

      <div className="flex-1 overflow-hidden">
        {view === "kanban" && <OpportunityKanban pipelineId={pipelineId} />}
        {view === "leads" && <OpportunityTable pipelineId={pipelineId} />}
        {view === "agent" && (
          <AgentRulesPanel pipelineId={pipelineId} pipelineName={pipelineName} />
        )}
      </div>
    </div>
  );
};
