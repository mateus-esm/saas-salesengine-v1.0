import { useMemo, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCopilotDecisions } from "@/hooks/useCopilotDecisions";
import { humanizeCopilotAction } from "@/lib/copilotHumanize";
import type { Pipeline } from "@/types/pipelines";

interface ControlRoomProps {
  pipelines: Pipeline[];
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function valueLabel(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "executed" || status === "approved") return "default";
  if (status === "rejected" || status === "failed") return "destructive";
  if (status === "pending_approval" || status === "proposed") return "secondary";
  return "outline";
}

export function ControlRoom({ pipelines }: ControlRoomProps) {
  const [pipelineId, setPipelineId] = useState<string>("all");
  const selectedPipelineId = pipelineId === "all" ? null : pipelineId;
  const { data: rows = [], isLoading, error } = useCopilotDecisions({
    pipelineId: selectedPipelineId,
  });

  const pipelineNames = useMemo(
    () => new Map(pipelines.map((p) => [p.id, p.name])),
    [pipelines],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Control Room</h2>
        </div>
        <Select value={pipelineId} onValueChange={setPipelineId}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Pipeline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pipelines</SelectItem>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando decisões
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">
            Não foi possível carregar o histórico do Copilot.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Nenhuma decisão registrada para este filtro.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Créditos</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const leadName = row.lead_name ?? "este lead";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(row.created_at)}
                    </TableCell>
                    <TableCell className="min-w-36 text-xs">
                      {row.pipeline_id
                        ? pipelineNames.get(row.pipeline_id) ?? row.pipeline_id.slice(0, 8)
                        : "-"}
                    </TableCell>
                    <TableCell className="min-w-64 text-xs font-medium">
                      {humanizeCopilotAction(row.output_action, leadName)}
                    </TableCell>
                    <TableCell className="min-w-32 text-xs">
                      {row.lead_name ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs">{row.field ?? "-"}</TableCell>
                    <TableCell className="max-w-52 truncate text-xs">
                      {valueLabel(row.value)}
                    </TableCell>
                    <TableCell className="text-xs">{row.credits}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)} className="text-[10px]">
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
