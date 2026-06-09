// src/components/crm/copilot/CopilotApprovalsPanel.tsx
//
// Sprint 6 · EPIC F · F4 — Approval cards panel
//
// Lists all pending `ai_decisions` for the active pipeline via
// `useCopilotApprovals`. Renders nothing (null) when the list is empty or
// while loading (a collapsed/invisible panel is least disruptive to the
// existing Kanban layout).
//
// Mounted once in PipelineWorkspace so the list stays above the tab content.

import { Bot } from "lucide-react";
import { useCopilotApprovals } from "@/hooks/useCopilotApprovals";
import { CopilotApprovalCard } from "./CopilotApprovalCard";

interface CopilotApprovalsPanelProps {
  pipelineId: string;
}

export const CopilotApprovalsPanel = ({
  pipelineId,
}: CopilotApprovalsPanelProps) => {
  const { data: decisions, isLoading } = useCopilotApprovals(pipelineId);

  // Render nothing while loading or when the queue is empty.
  if (isLoading || !decisions || decisions.length === 0) return null;

  return (
    <div className="border-b border-border bg-amber-50/40 dark:bg-amber-900/10 px-4 py-3">
      <div className="max-w-5xl mx-auto space-y-3">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Copilot — {decisions.length} ação
            {decisions.length > 1 ? "ões aguardando" : " aguardando"} aprovação
          </p>
        </div>

        {/* Cards — displayed in a responsive wrap */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decisions.map((decision) => (
            <CopilotApprovalCard
              key={decision.id}
              decision={decision}
              pipelineId={pipelineId}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
