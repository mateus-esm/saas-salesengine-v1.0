import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ColumnDef,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Clock, Loader2, MessageSquare, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnVisibilityDropdown } from "@/components/crm/ColumnVisibilityDropdown";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

import { useLeads } from "@/hooks/useLeads";
import { useOpportunities } from "@/hooks/useOpportunities";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { computeStageTelemetry, useTouchpointCounts } from "@/hooks/useStageTelemetry";
import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/displayName";

import { ContactDetailsModal } from "./ContactDetailsModal";
import { OpportunityDetailModal } from "./OpportunityDetailModal";
import type { Lead } from "@/types/crm";
import type {
  CustomFieldSchema,
  Opportunity,
  OpportunityStatus,
  PipelineStageV2,
} from "@/types/pipelines";

interface OpportunityTableProps {
  pipelineId: string;
}

interface Row {
  opp: Opportunity;
  lead: Lead | undefined;
  stage: PipelineStageV2 | undefined;
}

const formatCurrency = (v: number | null, currency: string) => {
  if (v === null || v === undefined) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(v);
  } catch {
    return `${currency} ${v}`;
  }
};

const formatCustom = (field: CustomFieldSchema, raw: unknown): string => {
  if (raw === null || raw === undefined || raw === "") return "—";
  switch (field.type) {
    case "currency":
      return typeof raw === "number"
        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(raw)
        : String(raw);
    case "boolean":
      return raw ? "Sim" : "Não";
    case "date":
      try {
        return new Date(String(raw)).toLocaleDateString("pt-BR");
      } catch {
        return String(raw);
      }
    default:
      return String(raw);
  }
};

export const OpportunityTable = ({ pipelineId }: OpportunityTableProps) => {
  const { pipelines } = usePipelines();
  const { stages } = usePipelineStagesV2(pipelineId);
  const { opportunities, isLoading, updateOpportunity, bulkDeleteOpportunities } =
    useOpportunities({ pipelineId });
  const { leads, updateLead, deleteLead } = useLeads();

  const pipeline = pipelines.find((p) => p.id === pipelineId);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [contactDrawerLead, setContactDrawerLead] = useState<Lead | null>(null);
  // Sprint 5.5 3.1 — Mass purge selection state. Keyed by opportunity id
  // (not table row index) so it survives sorting + filtering.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  // Sprint 5.3 T9 — column visibility. Status hidden by default since
  // stage_type (open/won/lost) already conveys the same information.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    status: false,
  });

  /** Sprint 5.3 T9 — human-readable labels for the column visibility toggle.
   *  Custom fields are NOT included here; they're dynamic and managed by the
   *  pipeline's custom_fields_schema configuration instead. */
  const COLUMN_LABELS: Record<string, string> = {
    lead: "Lead",
    value: "Valor",
    stage: "Etapa",
    time_in_phase: "Tempo na Fase",
    touchpoints: "Interações",
    status: "Status",
    updated: "Atualizada",
  };

  // Sprint 4 EPIC 2 §2.3 — same `?opp=<id>` deep-link contract as the Kanban.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOppId = searchParams.get("opp");

  useEffect(() => {
    if (!deepLinkOppId || selectedOpp?.id === deepLinkOppId) return;
    const match = opportunities.find((o) => o.id === deepLinkOppId);
    if (match) setSelectedOpp(match);
  }, [deepLinkOppId, opportunities, selectedOpp?.id]);

  const handleCloseDetail = useCallback(() => {
    setSelectedOpp(null);
    if (searchParams.has("opp")) {
      const next = new URLSearchParams(searchParams);
      next.delete("opp");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const leadsById = useMemo(() => {
    const map: Record<string, Lead> = {};
    for (const l of leads) map[l.id] = l;
    return map;
  }, [leads]);

  const stagesById = useMemo(() => {
    const map: Record<string, PipelineStageV2> = {};
    for (const s of stages) map[s.id] = s;
    return map;
  }, [stages]);

  const leadIds = useMemo(
    () => Array.from(new Set(opportunities.map((o) => o.lead_id))),
    [opportunities],
  );
  const touchpointCounts = useTouchpointCounts(leadIds);

  const schema = useMemo(
    () =>
      (pipeline?.custom_fields_schema ?? [])
        .filter((f) => !f.is_deleted)
        .sort((a, b) => a.position - b.position),
    [pipeline],
  );

  const rows: Row[] = useMemo(() => {
    return opportunities
      .filter((o) => {
        if (stageFilter !== "all" && o.stage_id !== stageFilter) return false;
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        if (globalFilter) {
          const lead = leadsById[o.lead_id];
          const needle = globalFilter.toLowerCase();
          const hay = `${formatDisplayName(lead?.name, lead?.phone) ?? ""} ${lead?.phone ?? ""} ${lead?.email ?? ""}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .map((o) => ({
        opp: o,
        lead: leadsById[o.lead_id],
        stage: stagesById[o.stage_id],
      }));
  }, [opportunities, leadsById, stagesById, stageFilter, statusFilter, globalFilter]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const fixed: ColumnDef<Row>[] = [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Selecionar todos"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Selecionar linha"
          />
        ),
        enableSorting: false,
      },
      {
        id: "lead",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Lead <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        accessorFn: (r) => formatDisplayName(r.lead?.name, r.lead?.phone, ""),
        cell: ({ row }) => (
          <span className="font-medium">
            {formatDisplayName(row.original.lead?.name, row.original.lead?.phone, "[Novo Contato - WhatsApp]")}
          </span>
        ),
      },
      {
        id: "value",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Valor <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        accessorFn: (r) => r.opp.value ?? 0,
        cell: ({ row }) => formatCurrency(row.original.opp.value, row.original.opp.currency),
      },
      {
        id: "stage",
        header: "Etapa",
        accessorFn: (r) => r.stage?.name ?? "",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Select
              value={r.opp.stage_id}
              onValueChange={(val) =>
                updateOpportunity.mutate({ id: r.opp.id, stage_id: val })
              }
            >
              <SelectTrigger className="h-8 border-transparent hover:border-input bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        id: "time_in_phase",
        header: "Tempo na Fase",
        accessorFn: (r) => new Date(r.opp.stage_entered_at).getTime(),
        cell: ({ row }) => {
          const t = computeStageTelemetry({
            stageEnteredAt: row.original.opp.stage_entered_at,
            maxIdleHours: row.original.stage?.max_idle_hours ?? null,
            touchpointCount: 0,
            nextContact: null,
          });
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                t.slaBreached
                  ? "text-destructive font-medium animate-pulse"
                  : "text-muted-foreground",
              )}
            >
              <Clock className="h-3 w-3" />
              {t.hoursInPhaseLabel}
            </span>
          );
        },
      },
      {
        id: "touchpoints",
        header: "Interações",
        accessorFn: (r) => touchpointCounts[r.opp.lead_id] ?? 0,
        cell: ({ row }) => {
          // T11 — breach alert when the manager's interaction cap is exceeded.
          const count = touchpointCounts[row.original.opp.lead_id] ?? 0;
          const maxInteractions = row.original.stage?.max_interactions ?? null;
          const breached =
            typeof maxInteractions === "number" && maxInteractions > 0 && count >= maxInteractions;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                breached ? "text-destructive font-medium animate-pulse" : "text-muted-foreground",
              )}
              title={
                breached
                  ? `Limite de ${maxInteractions} interações excedido`
                  : `${count} interações`
              }
            >
              <MessageSquare className="h-3 w-3" />
              {count}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.opp.status,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Select
              value={r.opp.status}
              onValueChange={(val) =>
                updateOpportunity.mutate({
                  id: r.opp.id,
                  status: val as OpportunityStatus,
                  closed_at: val === "open" ? null : r.opp.closed_at ?? new Date().toISOString(),
                })
              }
            >
              <SelectTrigger className="h-8 border-transparent hover:border-input bg-transparent w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberta</SelectItem>
                <SelectItem value="won">Ganha</SelectItem>
                <SelectItem value="lost">Perdida</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        id: "updated",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent font-semibold"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Atualizada <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        accessorFn: (r) => r.opp.updated_at,
        cell: ({ row }) =>
          new Date(row.original.opp.updated_at).toLocaleDateString("pt-BR"),
      },
    ];

    const dynamic: ColumnDef<Row>[] = schema.map((f) => ({
      id: `cf_${f.field_id}`,
      header: f.label,
      accessorFn: (r) => r.opp.custom_data?.[f.field_id] ?? null,
      cell: ({ row }) => formatCustom(f, row.original.opp.custom_data?.[f.field_id]),
    }));

    return [...fixed, ...dynamic];
  }, [schema, stages, touchpointCounts, updateOpportunity]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (r) => r.opp.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  const selectedOppIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  // Sprint 5.1 §5.2 — paddle-shifter siblings: the table rows in the exact
  // filtered + sorted order the user currently sees.
  const siblingsForSelected = useMemo(
    () => table.getSortedRowModel().rows.map((r) => r.original.opp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, rows, sorting, globalFilter, stageFilter, statusFilter],
  );

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteOpportunities.mutateAsync(selectedOppIds);
      setRowSelection({});
    } catch {
      // toast handled by mutation
    } finally {
      setShowBulkDelete(false);
    }
  };

  if (isLoading && opportunities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{pipeline?.name ?? "Pipeline"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {rows.length} leads · {schema.length} campos personalizados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por lead, email, telefone..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-xs"
          />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas etapas</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="open">Aberta</SelectItem>
              <SelectItem value="won">Ganha</SelectItem>
              <SelectItem value="lost">Perdida</SelectItem>
            </SelectContent>
          </Select>

          {/* Sprint 5.3 T9/T10 — column visibility toggle (shared component) */}
          <ColumnVisibilityDropdown
            columns={table
              .getAllColumns()
              .filter((col) => col.id !== "select")
              .map((col) => ({
                id: col.id,
                label: COLUMN_LABELS[col.id] ?? col.id.replace(/^cf_/, ""),
                visible: col.getIsVisible(),
              }))}
            onToggle={(id, visible) =>
              table.getColumn(id)?.toggleVisibility(visible)
            }
          />
        </div>

        {/* Sprint 5.5 3.1 — bulk action bar surfaces when ≥1 row is selected */}
        {selectedOppIds.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <span className="text-xs font-medium text-destructive whitespace-nowrap">
              {selectedOppIds.length} selecionada{selectedOppIds.length > 1 ? "s" : ""}
            </span>
            <div className="h-3 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setShowBulkDelete(true)}
              disabled={bulkDeleteOpportunities.isPending}
              title="Remover leads selecionados"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Excluir
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setRowSelection({})}
              disabled={bulkDeleteOpportunities.isPending}
              title="Limpar seleção"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-muted/30">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="whitespace-nowrap">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelectedOpp(row.original.opp)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="py-1.5"
                        onClick={(e) => {
                          // Let inline Selects / checkboxes capture their own clicks
                          // without opening the opportunity drawer.
                          if (
                            cell.column.id === "stage" ||
                            cell.column.id === "status" ||
                            cell.column.id === "select"
                          ) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    Nenhum lead encontrado nesta pipeline.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <OpportunityDetailModal
        open={!!selectedOpp}
        opportunity={selectedOpp}
        pipeline={pipeline}
        stages={stages}
        lead={selectedOpp ? leadsById[selectedOpp.lead_id] : undefined}
        onClose={handleCloseDetail}
        onOpenContact={(contactId) => {
          const target = leadsById[contactId];
          if (target) setContactDrawerLead(target);
        }}
        siblings={siblingsForSelected}
        onNavigate={(id) => {
          const next = opportunities.find((o) => o.id === id);
          if (next) setSelectedOpp(next);
        }}
      />

      <ContactDetailsModal
        lead={contactDrawerLead}
        open={!!contactDrawerLead}
        onClose={() => setContactDrawerLead(null)}
        onSave={(data) => {
          updateLead.mutate(data);
          setContactDrawerLead(null);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setContactDrawerLead(null);
        }}
      />

      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover leads selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedOppIds.length} lead{selectedOppIds.length > 1 ? "s serão removidos" : " será removido"}
              {" "}desta pipeline. Os contatos por trás continuam na Base de Contatos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteOpportunities.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteOpportunities.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteOpportunities.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
