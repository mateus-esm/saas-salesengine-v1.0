import { useCallback, useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { LayoutGrid, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AIAgentToggle } from "@/components/AIAgentToggle";
import { DatabaseView } from "@/components/crm/DatabaseView";
import { PipelineWorkspace } from "@/components/crm/PipelineWorkspace";
import { CompaniesDatabaseView } from "@/components/crm/companies/CompaniesDatabaseView";
import TasksView from "@/components/crm/TasksView";
import { PropertiesDatabaseView } from "@/components/crm/properties/PropertiesDatabaseView";
import { usePipelineSelection } from "@/hooks/usePipelineSelection";
import { useCustomTables, type CustomTable } from "@/hooks/useCustomTables";
import { CustomTableManager } from "@/components/crm/customtables/CustomTableManager";
import { CustomTableView } from "@/components/crm/customtables/CustomTableView";
import { FeatureActivationGrid } from "@/components/crm/customtables/FeatureActivationGrid";
import { AgendaView } from "@/components/crm/AgendaView";
import { CatalogView } from "@/components/crm/catalog/CatalogView";
import { CampaignsView } from "@/components/crm/campaigns/CampaignsView";
import { FILTER_PARAM_KEYS } from "@/lib/crmFilterParams";
import { TAB_LABELS, isTopTab, type TopTab } from "@/lib/crmTabs";

const CRM = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pipelineId, pipelines, isLoading } = usePipelineSelection();
  const { tables: customTables } = useCustomTables();

  const tab: TopTab = useMemo(() => {
    const raw = searchParams.get("tab");
    return isTopTab(raw) ? raw : "pipeline";
  }, [searchParams]);

  const setTab = useCallback(
    (next: string) => {
      if (!isTopTab(next)) return;
      const params = new URLSearchParams(searchParams);
      params.set("tab", next);
      // Switching away from Pipeline drops pipeline-scoped state so the URL
      // is honest about what's on screen. Switching away from Companies drops
      // the `company` deep-link param for the same reason.
      if (next !== "pipeline") {
        params.delete("view");
        params.delete("opp");
      }
      if (next !== "companies") {
        params.delete("company");
      }
      if (next !== "properties") {
        params.delete("property");
      }
      if (next !== "tabelas") {
        params.delete("custom_table");
      }
      // Sprint 11 · Onda 2 — each screen has its own filters in the URL (deals on
      // the pipeline, contacts on the contact base); a tab switch starts clean.
      if (next !== tab) {
        for (const key of FILTER_PARAM_KEYS) params.delete(key);
      }
      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams, tab],
  );

  const customTableSlug = searchParams.get("custom_table");
  const selectedCustomTable = customTableSlug
    ? customTables.find((t) => t.slug === customTableSlug) ?? null
    : null;

  // Old links to CRM › Copilot land on the app's opening, where the Copilot lives now.
  if (searchParams.get("tab") === "copilot") return <Navigate to="/home" replace />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sprint 15 · T5 — as abas viraram itens da barra lateral; aqui fica só o
          título da aba ativa (o celular não tem trilha) e os controles da página.
          O `overflow-x-auto` continua para os controles não quebrarem de linha. */}
      <div className="border-b border-border bg-card px-2 sm:px-4 py-2">
        <div className="flex items-center justify-between gap-3 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          <h1 className="text-base font-semibold">{TAB_LABELS[tab]}</h1>
          <div className="flex items-center gap-3">
            <FeatureActivationGrid />
            <AIAgentToggle />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === "contacts" ? (
          <DatabaseView />
        ) : tab === "companies" ? (
          <CompaniesDatabaseView />
        ) : tab === "properties" ? (
          <PropertiesDatabaseView />
        ) : tab === "catalogo" ? (
          <CatalogView />
        ) : tab === "campanhas" ? (
          <CampaignsView />
        ) : tab === "tasks" ? (
          <TasksView />
        ) : tab === "tabelas" ? (
          selectedCustomTable ? (
            <CustomTableView
              table={selectedCustomTable}
              onBack={() => {
                const params = new URLSearchParams(searchParams);
                params.delete("custom_table");
                setSearchParams(params, { replace: false });
              }}
            />
          ) : (
            <CustomTableManager
              onSelectTable={(table: CustomTable) => {
                const params = new URLSearchParams(searchParams);
                params.set("custom_table", table.slug);
                setSearchParams(params, { replace: false });
              }}
            />
          )
        ) : tab === "agenda" ? (
          <AgendaView />
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
