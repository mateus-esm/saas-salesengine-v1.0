import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Building2, Calendar, Home, LayoutGrid, ListChecks, Plus, Table2, Users } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { AIAgentToggle } from "@/components/AIAgentToggle";
import { DatabaseView } from "@/components/crm/DatabaseView";
import { PipelineWorkspace } from "@/components/crm/PipelineWorkspace";
import { CompaniesDatabaseView } from "@/components/crm/companies/CompaniesDatabaseView";
import TasksView from "@/components/crm/TasksView";
import { PropertiesDatabaseView } from "@/components/crm/properties/PropertiesDatabaseView";
import { usePipelineSelection } from "@/hooks/usePipelineSelection";
import CopilotCockpit from "@/pages/CopilotCockpit";
import { useCustomTables, type CustomTable } from "@/hooks/useCustomTables";
import { CustomTableManager } from "@/components/crm/customtables/CustomTableManager";
import { CustomTableView } from "@/components/crm/customtables/CustomTableView";
import { FeatureActivationGrid } from "@/components/crm/customtables/FeatureActivationGrid";
import { AgendaView } from "@/components/crm/AgendaView";

type TopTab = "pipeline" | "contacts" | "companies" | "properties" | "tasks" | "copilot" | "tabelas" | "agenda";

const TOP_TABS: TopTab[] = ["pipeline", "contacts", "companies", "properties", "tasks", "copilot", "tabelas", "agenda"];
const isTopTab = (v: string | null): v is TopTab =>
  !!v && TOP_TABS.includes(v as TopTab);

const TAB_LABELS: Record<TopTab, string> = {
  pipeline: "Pipeline",
  contacts: "Base de Contatos",
  companies: "Empresas",
  properties: "Imóveis",
  tasks: "Tarefas",
  copilot: "Copilot",
  tabelas: "Tabelas",
  agenda: "Agenda",
};

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
      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const customTableSlug = searchParams.get("custom_table");
  const selectedCustomTable = customTableSlug
    ? customTables.find((t) => t.slug === customTableSlug) ?? null
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 py-2">
        <Breadcrumb className="mb-2">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-sm font-medium">CRM</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-sm text-muted-foreground">
                {TAB_LABELS[tab]}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="properties" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Imóveis
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Tarefas
            </TabsTrigger>
            <TabsTrigger value="copilot" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Copilot
            </TabsTrigger>
            <TabsTrigger value="tabelas" className="flex items-center gap-2">
              <Table2 className="h-4 w-4" />
              Tabelas
            </TabsTrigger>
            <TabsTrigger value="agenda" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Agenda
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <FeatureActivationGrid />
        <AIAgentToggle />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "contacts" ? (
          <DatabaseView />
        ) : tab === "companies" ? (
          <CompaniesDatabaseView />
        ) : tab === "properties" ? (
          <PropertiesDatabaseView />
        ) : tab === "tasks" ? (
          <TasksView />
        ) : tab === "copilot" ? (
          <CopilotCockpit />
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
