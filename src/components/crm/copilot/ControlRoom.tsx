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
import { useCopilotDecisions, type CopilotDecisionRow } from "@/hooks/useCopilotDecisions";
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function actionVerb(action: unknown): string {
  const a = asRecord(action);
  const args = asRecord(a?.args);
  return (
    text(a?.verb) ??
    text(a?.action) ??
    text(args?.verb) ??
    text(args?.action) ??
    text(a?.intent) ??
    "manual"
  );
}

function originLabel(row: CopilotDecisionRow): string {
  const action = asRecord(row.output_action);
  const ledger = asRecord(action?.ledger);
  const mode = text(action?.mode) ?? text(ledger?.mode) ?? text(row.decision_type);
  if (mode?.toLowerCase() === "manual" || row.agent_role?.toLowerCase() === "manual") {
    return "Manual";
  }
  if (!row.agent_role) return "Manual";
  const labels: Record<string, string> = {
    tower_doorman: "Tower",
    floor_doorman: "Floor",
    worker: "Worker",
    autonomous_team: "Copilot",
    track_shaper: "Copilot",
  };
  return labels[row.agent_role] ?? row.agent_role;
}

function valueLabel(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueLabel).join(", ");
  const record = asRecord(value);
  return (
    text(record?.name) ??
    text(record?.label) ??
    text(record?.title) ??
    text(record?.url) ??
    "Dados preenchidos"
  );
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
                <TableHead>Data</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatTime(row.created_at)}
                  </TableCell>
                  <TableCell className="min-w-32 text-xs">
                    <div className="font-medium text-foreground">{row.lead_name ?? "-"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {row.pipeline_id
                        ? pipelineNames.get(row.pipeline_id) ?? row.pipeline_id.slice(0, 8)
                        : "-"}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-28 text-xs font-medium">
                    {actionVerb(row.output_action)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {originLabel(row)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.field ?? "-"}</TableCell>
                  <TableCell className="max-w-52 truncate text-xs">
                    {valueLabel(row.value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)} className="text-[10px]">
                      {row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
