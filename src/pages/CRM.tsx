import { useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Table, Plus, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { AIAgentToggle } from "@/components/AIAgentToggle";
import { PipelineSelector } from "@/components/crm/PipelineSelector";
import { OpportunityKanban } from "@/components/crm/OpportunityKanban";
import { OpportunityTable } from "@/components/crm/OpportunityTable";
import { DatabaseView } from "@/components/crm/DatabaseView";
import { usePipelineSelection } from "@/hooks/usePipelineSelection";

type View = "kanban" | "database" | "leads";

const CRM = () => {
  const [view, setView] = useState<View>("kanban");
  const { pipelineId, pipelines, isLoading } = usePipelineSelection();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="kanban" className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center gap-2">
                <Table className="h-4 w-4" />
                Database
              </TabsTrigger>
              <TabsTrigger value="leads" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Leads
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {view !== "leads" && <PipelineSelector />}
        </div>
        <AIAgentToggle />
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "leads" ? (
          <DatabaseView />
        ) : !isLoading && pipelines.length === 0 ? (
          <EmptyPipelinesState />
        ) : pipelineId ? (
          view === "kanban" ? (
            <OpportunityKanban pipelineId={pipelineId} />
          ) : (
            <OpportunityTable pipelineId={pipelineId} />
          )
        ) : null}
      </div>
    </div>
  );
};

const EmptyPipelinesState = () => (
  <div className="h-full flex items-center justify-center p-8">
    <div className="max-w-md text-center space-y-3">
      <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground" />
      <h2 className="text-lg font-semibold">Nenhuma pipeline ativa</h2>
      <p className="text-sm text-muted-foreground">
        Crie sua primeira pipeline para começar a organizar oportunidades por
        processo comercial. Cada pipeline tem suas próprias etapas e campos personalizados.
      </p>
      <Button asChild>
        <Link to="/pipeline">
          <Plus className="h-4 w-4 mr-2" />
          Criar Pipeline
        </Link>
      </Button>
    </div>
  </div>
);

export default CRM;
