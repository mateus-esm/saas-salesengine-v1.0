import { useState } from "react";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { DatabaseView } from "@/components/crm/DatabaseView";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, Table } from "lucide-react";

import { AIAgentToggle } from "@/components/AIAgentToggle";

const CRM = () => {
  const [view, setView] = useState<"kanban" | "database">("kanban");

  return (
    <div className="flex flex-col h-full">
      {/* View Toggle */}
      <div className="border-b border-border bg-card px-4 py-2 flex items-center justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "database")}>
          <TabsList>
            <TabsTrigger value="kanban" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Table className="h-4 w-4" />
              Database
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <AIAgentToggle />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === "kanban" ? <KanbanBoard /> : <DatabaseView />}
      </div>
    </div>
  );
};

export default CRM;
