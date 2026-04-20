import { Link } from "react-router-dom";
import { Workflow, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { usePipelineSelection } from "@/hooks/usePipelineSelection";

interface PipelineSelectorProps {
  /** Optional slot for secondary actions (e.g. "New opportunity") next to the selector. */
  right?: React.ReactNode;
}

export const PipelineSelector = ({ right }: PipelineSelectorProps) => {
  const { pipelines, pipelineId, setPipeline, isLoading } = usePipelineSelection();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Workflow className="h-4 w-4 text-muted-foreground shrink-0" />
      {pipelines.length === 0 ? (
        <span className="text-sm text-muted-foreground">Nenhuma pipeline ativa</span>
      ) : (
        <Select
          value={pipelineId ?? undefined}
          onValueChange={setPipeline}
          disabled={isLoading}
        >
          <SelectTrigger className="h-9 min-w-[220px]">
            <SelectValue placeholder="Selecionar pipeline" />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button asChild variant="ghost" size="sm" className="h-9">
        <Link to="/pipeline">
          <Settings2 className="h-4 w-4 mr-1.5" />
          Configurar
        </Link>
      </Button>

      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
};
