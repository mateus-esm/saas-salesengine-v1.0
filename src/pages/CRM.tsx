import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LayoutGrid, Plus, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { AIAgentToggle } from "@/components/AIAgentToggle";
import { DatabaseView } from "@/components/crm/DatabaseView";
import { PipelineWorkspace } from "@/components/crm/PipelineWorkspace";
import { usePipelineSelection } from "@/hooks/usePipelineSelection";

type TopTab = "pipeline" | "contacts";

const TOP_TABS: TopTab[] = ["pipeline", "contacts"];
const isTopTab = (v: string | null): v is TopTab =>
  !!v && TOP_TABS.includes(v as TopTab);

const CRM = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pipelineId, pipelines, isLoading } = usePipelineSelection();

  const tab: TopTab = useMemo(() => {
    const raw = searchParams.get("tab");
    return isTopTab(raw) ? raw : "pipeline";
  }, [searchParams]);

  const setTab = useCallback(
    (next: string) => {
      if (!isTopTab(next)) return;
      const params = new URLSearchParams(searchParams);
      params.set("tab", next);
      // Switching to global Base de Contatos drops pipeline-scoped state so the
      // URL is honest about what's on screen.
      if (next === "contacts") {
        params.delete("view");
        params.delete("opp");
      }
      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pipeline" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Base de Contatos
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <AIAgentToggle />
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "contacts" ? (
          <DatabaseView />
        ) : !isLoading && pipelines.length === 0 ? (
          <EmptyPipelinesState />
        ) : pipelineId ? (
          <PipelineWorkspace pipelineId={pipelineId} />
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
        Crie sua primeira pipeline para começar a organizar leads por
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
