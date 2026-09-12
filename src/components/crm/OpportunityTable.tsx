import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBoardSummary } from "@/hooks/useBoard";
import { useLead, useOpportunity } from "@/hooks/useLead";
import { useLeadMutations } from "@/hooks/useLeads";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import {
  useDeleteOpportunities,
  useOppCellUpdate,
  useOppTable,
  useOppTablePatcher,
  useOppTableRealtime,
  useUpdateOpportunities,
} from "@/hooks/useOppTable";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { computeStageTelemetry } from "@/hooks/useStageTelemetry";
import { useDealUrlFilters } from "@/hooks/useUrlFilters";
import { formatDisplayName } from "@/lib/displayName";
import { columnFromField } from "@/lib/fields/columns";
import { getFieldType } from "@/lib/fields/registry";
import { flattenPages } from "@/lib/tablePages";
import { formatBRL } from "@/lib/scoreboard";
import type { CrmSort } from "@/types/crmFilters";
import type { OppTableRow } from "@/types/crmTables";
import type { CustomFieldSchema, Opportunity, OpportunityStatus } from "@/types/pipelines";

import { ContactDetailsModal } from "./ContactDetailsModal";
import { UserAvatar } from "./fields/UserAvatar";
import { UserPicker } from "./fields/UserPicker";
import { DealFilterBar } from "./filters/DealFilterBar";
import { countDealFilters } from "./filters/model";
import { OpportunityDetailModal } from "./OpportunityDetailModal";
import { SpreadsheetGrid } from "./grid/SpreadsheetGrid";
import type { MassAction } from "./grid/MassActionBar";
import type { CellMutation, ColumnDef, GridRow } from "./grid/types";

interface OpportunityTableProps {
  pipelineId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const STATUS_OPTIONS: { value: OpportunityStatus; label: string }[] = [
  { value: "open", label: "Aberta" },
  { value: "won", label: "Ganha" },
  { value: "lost", label: "Perdida" },
];

// ---------------------------------------------------------------------------
// Sort: a grid column ↔ the server's sort key (crm_opp_table)
// ---------------------------------------------------------------------------

function toServerSort(gridKey: string, dir: "asc" | "desc", schema: CustomFieldSchema[]): CrmSort | null {
  switch (gridKey) {
    case "lead_name":
      return { key: "lead_name", dir };
    case "owner_id":
      return { key: "owner_name", dir };
    case "value":
    case "created_at":
    case "updated_at":
    case "next_contact":
      return { key: gridKey, dir };
    case "stage_id":
      return { key: "stage", dir };
    // Less time in the stage = entered later.
    case "time_in_phase_label":
      return { key: "stage_entered_at", dir: dir === "asc" ? "desc" : "asc" };
    default: {
      const field = schema.find((f) => f.field_id === gridKey);
      return field && getFieldType(field.type).sortAs ? { key: `cf:${gridKey}`, dir } : null;
    }
  }
}

function toGridSort(sort: CrmSort | null): { key?: string; dir: "asc" | "desc" | null } {
  if (!sort) return { dir: null };
  const map: Record<string, string> = {
    lead_name: "lead_name",
    owner_name: "owner_id",
    value: "value",
    created_at: "created_at",
    updated_at: "updated_at",
    next_contact: "next_contact",
    stage: "stage_id",
  };
  if (sort.key === "stage_entered_at") {
    return { key: "time_in_phase_label", dir: sort.dir === "asc" ? "desc" : "asc" };
  }
  if (sort.key.startsWith("cf:")) return { key: sort.key.slice(3), dir: sort.dir };
  return map[sort.key] ? { key: map[sort.key], dir: sort.dir } : { dir: null };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sprint 11 · Onda 2 · T18 — the Leads table of a pipeline, from the server.
 *
 * Pages of 50 from crm_opp_table, with the Kanban's filters (same URL, same
 * server function: the total here is the Kanban's total) and sorting on the
 * server. Each row already carries the contact, owner, companies, touchpoints
 * and score — no request per row. Cells edit each field type correctly
 * (registry); bulk actions go through the business verbs (one request each).
 */
export const OpportunityTable = ({ pipelineId }: OpportunityTableProps) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const { pipelines } = usePipelines();
  const { stages } = usePipelineStagesV2(pipelineId);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const { nameOf } = useMemberDirectory();

  const { filters, setFilters, sort, setSort } = useDealUrlFilters();
  const query = useOppTable(pipelineId, filters, sort);
  useOppTableRealtime(pipelineId);
  const summary = useBoardSummary(pipelineId, filters);
  const total = useMemo(() => (summary.data ?? []).reduce((sum, s) => sum + s.count, 0), [summary.data]);
  const rows = useMemo(() => flattenPages(query.data), [query.data]);

  const updateMany = useUpdateOpportunities(pipelineId, filters, sort);
  const deleteMany = useDeleteOpportunities(pipelineId, filters, sort);
  const updateCell = useOppCellUpdate(pipelineId, filters, sort);
  const patchRow = useOppTablePatcher(pipelineId, filters, sort);
  const { updateLead, deleteLead } = useLeadMutations();

  const orderedStages = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
  const stagesById = useMemo(() => new Map(orderedStages.map((s) => [s.id, s])), [orderedStages]);
  const schema = useMemo(
    () =>
      (pipeline?.custom_fields_schema ?? [])
        .filter((f) => !f.is_deleted)
        .sort((a, b) => a.position - b.position),
    [pipeline?.custom_fields_schema],
  );

  // ---- Modals ---------------------------------------------------------------
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [contactLeadId, setContactLeadId] = useState<string | null>(null);
  const selectedLead = useLead(selectedOpp?.lead_id);
  const contactLead = useLead(contactLeadId);

  // Sprint 4 EPIC 2 §2.3 — ?opp=<id> opens the deal, even if its page is not loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOppId = searchParams.get("opp");
  const deepLinkOpp = useOpportunity(deepLinkOppId && selectedOpp?.id !== deepLinkOppId ? deepLinkOppId : null);
  useEffect(() => {
    const opp = deepLinkOpp.data;
    if (opp && opp.pipeline_id === pipelineId) setSelectedOpp(opp);
  }, [deepLinkOpp.data, pipelineId]);

  const handleCloseDetail = useCallback(() => {
    setSelectedOpp(null);
    if (searchParams.has("opp")) {
      const next = new URLSearchParams(searchParams);
      next.delete("opp");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ---- Bulk-action dialogs -------------------------------------------------
  const [moveIds, setMoveIds] = useState<string[]>([]);
  const [moveStageId, setMoveStageId] = useState("");
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [assignOwner, setAssignOwner] = useState<string | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  // ---- Columns --------------------------------------------------------------
  const columns: ColumnDef[] = useMemo(() => {
    const stageOptions = orderedStages.map((s) => ({ value: s.id, label: s.name }));
    const native: ColumnDef[] = [
      { key: "lead_name", label: "Lead", kind: "text", source: "native", editable: false, primary: true, width: 220 },
      { key: "owner_id", label: "Responsável", kind: "user", source: "native", context: { nameOf } },
      {
        key: "company",
        label: "Empresa",
        kind: "relation",
        source: "native",
        relation: { table: "companies", displayField: "name", linkTable: "opportunity_links", resolvedFromRow: true },
      },
      { key: "property_count", label: "Imóveis", kind: "number", source: "native", editable: false, width: 90 },
      { key: "value", label: "Valor", kind: "currency", source: "native" },
      { key: "stage_id", label: "Etapa", kind: "select", source: "native", options: stageOptions },
      { key: "time_in_phase_label", label: "Tempo na fase", kind: "text", source: "native", editable: false },
      { key: "touchpoints_count", label: "Interações", kind: "number", source: "native", editable: false, width: 100 },
      { key: "status", label: "Status", kind: "select", source: "native", options: STATUS_OPTIONS },
      { key: "next_contact", label: "Próximo contato", kind: "date", source: "native", editable: false },
      { key: "created_at", label: "Criado em", kind: "date", source: "native", editable: false },
      { key: "updated_at", label: "Atualizada", kind: "date", source: "native", editable: false },
    ];
    const custom = schema.map((f) => columnFromField(f, "custom_data", "field_id", { nameOf }));
    return [...native, ...custom];
  }, [orderedStages, schema, nameOf]);

  // ---- Rows -----------------------------------------------------------------
  const gridRows: GridRow[] = useMemo(
    () =>
      rows.map((r) => {
        const stage = stagesById.get(r.stage_id);
        const telemetry = computeStageTelemetry({
          stageEnteredAt: r.stage_entered_at,
          maxIdleHours: stage?.max_idle_hours ?? null,
          touchpointCount: r.touchpoint_count,
          nextContact: null,
        });
        const row: GridRow = {
          id: r.id,
          equipe_id: r.equipe_id,
          lead_name: formatDisplayName(r.lead?.name, r.lead?.phone, "[Novo Contato - WhatsApp]"),
          owner_id: r.owner_id,
          company: r.companies,
          property_count: r.property_count,
          value: r.value,
          stage_id: r.stage_id,
          time_in_phase_label: telemetry.hoursInPhaseLabel,
          touchpoints_count: r.touchpoint_count,
          status: r.status,
          next_contact: r.lead?.next_contact ?? null,
          created_at: r.created_at,
          updated_at: r.updated_at,
          _lead_score: r.lead_score,
          _lead_breakdown: r.lead_score !== null ? { icp: r.icp_score, velocity: r.velocity } : undefined,
        };
        for (const field of schema) row[field.field_id] = r.custom_data?.[field.field_id] ?? null;
        return row;
      }),
    [rows, stagesById, schema],
  );

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // Sprint 11 · T26 — on a phone each deal is a line: name; stage · value ·
  // next contact; the owner. A tap opens the deal.
  const renderMobileRow = useCallback(
    (row: GridRow) => {
      const stage = stagesById.get(row.stage_id as string);
      const value = row.value as number | null;
      const next = row.next_contact as string | null;
      const ownerId = (row.owner_id as string | null) ?? null;
      return (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.lead_name as string}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {stage && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                  {stage.name}
                </span>
              )}
              {value !== null && value !== undefined && <span>· {formatBRL(value)}</span>}
              {next && <span>· Próx. {next.slice(8, 10)}/{next.slice(5, 7)}</span>}
            </p>
          </div>
          <UserAvatar userId={ownerId} name={ownerId ? nameOf(ownerId) : null} size="sm" />
        </div>
      );
    },
    [stagesById, nameOf],
  );

  // ---- Sort -----------------------------------------------------------------
  const gridSort = toGridSort(sort);
  const handleSort = useCallback(
    (key: string, dir: "asc" | "desc" | null) => {
      if (!dir) return setSort(null);
      const next = toServerSort(key, dir, schema);
      if (next) setSort(next);
    },
    [schema, setSort],
  );

  // ---- Cell commit ----------------------------------------------------------
  const handleCellCommit = useCallback(
    async (m: CellMutation) => {
      const row = rowById.get(m.rowId);
      if (!row) return;

      if (m.column.key === "company") {
        const link = m.value as { toId: string; label: string; action?: "remove" } | undefined;
        if (!link || !equipeId) return;
        if (link.action === "remove") {
          const { error } = await sb
            .from("opportunity_links")
            .update({ deleted_at: new Date().toISOString() })
            .eq("opportunity_id", row.id)
            .eq("linked_type", "company")
            .eq("linked_id", link.toId)
            .eq("equipe_id", equipeId);
          if (error) throw new Error(error.message);
          patchRow(row.id, { companies: row.companies.filter((c) => c.id !== link.toId) });
        } else {
          const { error } = await sb.from("opportunity_links").insert({
            equipe_id: equipeId,
            opportunity_id: row.id,
            linked_type: "company",
            linked_id: link.toId,
            relation: "related",
          });
          if (error) throw new Error(error.message);
          patchRow(row.id, { companies: [...row.companies, { id: link.toId, name: link.label }] });
        }
        return;
      }

      if (m.column.key === "owner_id") {
        const ownerId = (m.value as string | null) ?? null;
        await updateMany.mutateAsync({
          ids: [row.id],
          patch: { owner_id: ownerId },
          display: { owner_name: ownerId ? nameOf(ownerId) : null },
        });
        return;
      }

      if (m.column.key === "stage_id") {
        if (!m.value) throw new Error("A etapa é obrigatória.");
        await updateMany.mutateAsync({ ids: [row.id], patch: { stage_id: String(m.value) } });
        return;
      }

      if (m.column.key === "status") {
        if (!m.value) throw new Error("O status é obrigatório.");
        const status = m.value as OpportunityStatus;
        await updateCell(row.id, { status, closed_at: status === "open" ? null : new Date().toISOString() });
        return;
      }

      if (m.column.key === "value") {
        await updateCell(row.id, { value: m.value ?? null });
        return;
      }

      if (m.column.source === "jsonb") {
        const custom_data = { ...(row.custom_data ?? {}), [m.column.key]: m.value };
        await updateCell(row.id, { custom_data });
      }
    },
    [rowById, equipeId, patchRow, updateMany, updateCell, nameOf],
  );

  // ---- Bulk actions ---------------------------------------------------------
  const massActions: MassAction[] = useMemo(
    () => [
      {
        id: "move-stage",
        label: "Mover para etapa",
        icon: <ArrowRight className="mr-1 h-4 w-4" />,
        run: async (ids) => {
          setMoveIds(ids);
          setMoveStageId("");
        },
      },
      {
        id: "assign-owner",
        label: "Atribuir responsável",
        icon: <UserRound className="mr-1 h-4 w-4" />,
        run: async (ids) => {
          setAssignIds(ids);
          setAssignOwner(null);
        },
      },
      {
        id: "delete",
        label: "Excluir",
        icon: <Trash2 className="mr-1 h-4 w-4" />,
        run: async (ids) => setDeleteIds(ids),
        destructive: true,
      },
    ],
    [],
  );

  const filtered = countDealFilters(filters) > 0;
  const resultLabel = summary.isLoading
    ? "…"
    : `${total.toLocaleString("pt-BR")} ${filtered ? (total === 1 ? "encontrado" : "encontrados") : total === 1 ? "negócio" : "negócios"}`;

  if (query.isLoading && rows.length === 0 && !query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border bg-card p-4">
        <div>
          <h1 className="text-xl font-bold">{pipeline?.name ?? "Pipeline"}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{schema.length} campos personalizados</p>
        </div>
        <DealFilterBar
          filters={filters}
          onChange={setFilters}
          stages={orderedStages}
          fields={schema}
          resultLabel={resultLabel}
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {query.isError ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-destructive">
            Não foi possível carregar a tabela.
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <SpreadsheetGrid
            rows={gridRows}
            columns={columns}
            onCellCommit={handleCellCommit}
            massActions={massActions}
            loading={query.isLoading}
            equipeId={equipeId}
            fromTable="opportunities"
            onSort={handleSort}
            sortKey={gridSort.key}
            sortDir={gridSort.dir}
            surfaceKey="opportunity_table"
            allowColumnReorder
            allowColumnResize
            allowColumnHide
            showLeadScore
            renderMobileRow={renderMobileRow}
            mobileEmptyLabel="Nenhum negócio com esses filtros."
            onRowOpen={(id) => {
              const r = rowById.get(id);
              if (r) setSelectedOpp(r);
            }}
            hasMore={!!query.hasNextPage}
            loadingMore={query.isFetchingNextPage}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
          />
        )}
      </div>

      <OpportunityDetailModal
        open={!!selectedOpp}
        opportunity={selectedOpp}
        pipeline={pipeline}
        stages={orderedStages}
        lead={selectedLead.data ?? undefined}
        onClose={handleCloseDetail}
        onOpenContact={(contactId) => setContactLeadId(contactId)}
        siblings={rows as Opportunity[]}
        onNavigate={(id) => {
          const next = rowById.get(id);
          if (next) setSelectedOpp(next as OppTableRow);
        }}
      />

      <ContactDetailsModal
        lead={contactLead.data ?? null}
        open={!!contactLeadId && !!contactLead.data}
        onClose={() => setContactLeadId(null)}
        onSave={(data) => {
          updateLead.mutate(data);
          setContactLeadId(null);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setContactLeadId(null);
        }}
      />

      {/* Mover para etapa */}
      <Dialog open={moveIds.length > 0} onOpenChange={(o) => !o && setMoveIds([])}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Mover para etapa</DialogTitle>
            <DialogDescription>
              Mover {moveIds.length} {moveIds.length === 1 ? "negócio" : "negócios"} para qual etapa?
            </DialogDescription>
          </DialogHeader>
          <Select value={moveStageId} onValueChange={setMoveStageId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma etapa..." />
            </SelectTrigger>
            <SelectContent>
              {orderedStages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveIds([])}>
              Cancelar
            </Button>
            <Button
              disabled={!moveStageId || updateMany.isPending}
              onClick={() => {
                const ids = moveIds;
                updateMany.mutate(
                  { ids, patch: { stage_id: moveStageId } },
                  { onSuccess: (n) => toast.success(`${n} ${n === 1 ? "negócio movido" : "negócios movidos"}`) },
                );
                setMoveIds([]);
              }}
            >
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Atribuir responsável */}
      <Dialog open={assignIds.length > 0} onOpenChange={(o) => !o && setAssignIds([])}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Atribuir responsável</DialogTitle>
            <DialogDescription>
              Quem fica responsável por {assignIds.length} {assignIds.length === 1 ? "negócio" : "negócios"}?
            </DialogDescription>
          </DialogHeader>
          <UserPicker value={assignOwner} onChange={setAssignOwner} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignIds([])}>
              Cancelar
            </Button>
            <Button
              disabled={updateMany.isPending}
              onClick={() => {
                const ids = assignIds;
                updateMany.mutate(
                  {
                    ids,
                    patch: { owner_id: assignOwner },
                    display: { owner_name: assignOwner ? nameOf(assignOwner) : null },
                  },
                  { onSuccess: (n) => toast.success(`Responsável atribuído a ${n} ${n === 1 ? "negócio" : "negócios"}`) },
                );
                setAssignIds([]);
              }}
            >
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir */}
      <AlertDialog open={deleteIds.length > 0} onOpenChange={(o) => !o && setDeleteIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir negócios</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir {deleteIds.length} {deleteIds.length === 1 ? "negócio" : "negócios"}? O contato continua na Base
              de Contatos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteMany.mutate(deleteIds);
                setDeleteIds([]);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
