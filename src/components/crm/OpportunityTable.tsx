import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLeads } from "@/hooks/useLeads";
import { useLeadEntitySummary } from "@/hooks/useLeadEntitySummary";
import { useLeadScores } from "@/hooks/useLeadScores";
import { useColumnLayout } from "@/hooks/useColumnLayout";
import { useOpportunities } from "@/hooks/useOpportunities";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { computeStageTelemetry, useTouchpointCounts } from "@/hooks/useStageTelemetry";
import { formatDisplayName } from "@/lib/displayName";

import { ContactDetailsModal } from "./ContactDetailsModal";
import { OpportunityDetailModal } from "./OpportunityDetailModal";
import { SpreadsheetGrid } from "./grid/SpreadsheetGrid";
import { GridToolbar } from "./grid/GridToolbar";
import type { ColumnDef, CellMutation, GridRow } from "./grid/types";
import type { MassAction } from "./grid/MassActionBar";
import type { Lead } from "@/types/crm";
import type {
  CustomFieldSchema,
  CustomFieldType,
  Opportunity,
  OpportunityStatus,
  PipelineStageV2,
} from "@/types/pipelines";

interface OpportunityTableProps {
  pipelineId: string;
}

// ---------------------------------------------------------------------------
// Helper — map CustomFieldType to grid ColumnKind
// ---------------------------------------------------------------------------
function toColumnKind(type: CustomFieldType): ColumnDef["kind"] {
  switch (type) {
    case "number":
    case "currency":
      return "number";
    case "select":
      return "select";
    case "date":
      return "date";
    default:
      return "text";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OpportunityTable = ({ pipelineId }: OpportunityTableProps) => {
  const { profile } = useAuth();
  const { pipelines } = usePipelines();
  const { stages } = usePipelineStagesV2(pipelineId);
  const { opportunities, isLoading, updateOpportunity, bulkDeleteOpportunities } =
    useOpportunities({ pipelineId });
  const { leads, updateLead, deleteLead } = useLeads();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();

  const pipeline = pipelines.find((p) => p.id === pipelineId);

  const [globalFilter, setGlobalFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [contactDrawerLead, setContactDrawerLead] = useState<Lead | null>(null);

  // Sprint 6.8 T4.2 — sort state
  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  // Sprint 6.8 T5.3 — grid toolbar derived state
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (stageFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (globalFilter.length > 0) count++;
    return count;
  }, [stageFilter, statusFilter, globalFilter]);

  const handleClearFilters = useCallback(() => {
    setStageFilter("all");
    setStatusFilter("all");
    setGlobalFilter("");
  }, []);

  // Sprint 6.8 T4.4 — bulk move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveIds, setMoveIds] = useState<string[]>([]);
  const [moveStageId, setMoveStageId] = useState<string>("");

  const bulkMove = useMutation({
    mutationFn: async ({
      ids,
      stageId,
    }: {
      ids: string[];
      stageId: string;
    }) => {
      const { error } = await supabase
        .from("opportunities")
        .update({ stage_id: stageId })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success("Oportunidades movidas com sucesso");
    },
    onError: (err) => toast.error("Erro ao mover: " + err.message),
  });

  // Sprint 4 EPIC 2 §2.3 — deep-link via ?opp=<id>
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

  // ---- Derived data -------------------------------------------------------
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

  // ---- Filter -------------------------------------------------------------
  const filteredOpps = useMemo(() => {
    return opportunities.filter((o) => {
      if (stageFilter !== "all" && o.stage_id !== stageFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (globalFilter) {
        const lead = leadsById[o.lead_id];
        const needle = globalFilter.toLowerCase();
        const hay = `${formatDisplayName(lead?.name, lead?.phone) ?? ""} ${lead?.phone ?? ""} ${lead?.email ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [opportunities, leadsById, stageFilter, statusFilter, globalFilter]);

  const rowLeadIds = useMemo(
    () => filteredOpps.map((o) => o.lead_id).filter(Boolean),
    [filteredOpps],
  );

  const { data: entitySummary = {} } = useLeadEntitySummary(rowLeadIds);
  const { scores: leadScores } = useLeadScores(rowLeadIds);

  // ---- Column definitions -------------------------------------------------
  const stageOptions = useMemo(
    () => stages.map((s) => ({ value: s.id, label: s.name })),
    [stages],
  );

  const statusOptions: { value: string; label: string }[] = [
    { value: "open", label: "Aberta" },
    { value: "won", label: "Ganha" },
    { value: "lost", label: "Perdida" },
  ];

  const nativeColumns: ColumnDef[] = useMemo(
    () => [
      {
        key: "lead_name",
        label: "Lead",
        kind: "text",
        source: "native",
        editable: false,
      },
      {
        key: "company",
        label: "Empresa",
        kind: "relation" as ColumnKind,
        source: "native",
        editable: true,
        relation: {
          table: "companies",
          displayField: "name",
          linkTable: "opportunity_links",
        },
      },
      {
        key: "property_count",
        label: "Imóveis",
        kind: "number",
        source: "native",
        editable: false,
      },
      {
        key: "value",
        label: "Valor",
        kind: "number",
        source: "native",
        editable: true,
      },
      {
        key: "stage_id",
        label: "Etapa",
        kind: "select",
        source: "native",
        editable: true,
        options: stageOptions,
      },
      {
        key: "time_in_phase_label",
        label: "Tempo na Fase",
        kind: "text",
        source: "native",
        editable: false,
      },
      {
        key: "touchpoints_count",
        label: "Interações",
        kind: "number",
        source: "native",
        editable: false,
      },
      {
        key: "status",
        label: "Status",
        kind: "select",
        source: "native",
        editable: true,
        options: statusOptions,
      },
      {
        key: "updated_at",
        label: "Atualizada",
        kind: "date",
        source: "native",
        editable: false,
      },
    ],
    [stageOptions],
  );

  const customColumns: ColumnDef[] = useMemo(
    () =>
      schema.map((f) => ({
        key: f.field_id,
        label: f.label,
        kind: toColumnKind(f.type),
        source: "jsonb" as const,
        jsonbField: "custom_data" as const,
      })),
    [schema],
  );

  const allColumns = useMemo(
    () => [...nativeColumns, ...customColumns],
    [nativeColumns, customColumns],
  );

  // Sprint 6.8 T4.2 — column layout (persisted widths)
  const { resizeColumn } = useColumnLayout(allColumns, "opportunity_table");

  // Sprint 6.8 T4.2 — sort handler
  const handleSort = useCallback(
    (key: string, dir: "asc" | "desc" | null) => {
      setSortKey(dir ? key : undefined);
      setSortDir(dir);
    },
    [],
  );

  // ---- Grid rows ----------------------------------------------------------
  const gridRows: GridRow[] = useMemo(() => {
    return filteredOpps.map((opp) => {
      const lead = leadsById[opp.lead_id];
      const stage = stagesById[opp.stage_id];
      const summary = opp.lead_id ? entitySummary[opp.lead_id] : undefined;
      const telemetry = computeStageTelemetry({
        stageEnteredAt: opp.stage_entered_at,
        maxIdleHours: stage?.max_idle_hours ?? null,
        touchpointCount: touchpointCounts[opp.lead_id] ?? 0,
        nextContact: null,
      });

      const row: GridRow = {
        id: opp.id,
        equipe_id: opp.equipe_id,
        lead_name: formatDisplayName(
          lead?.name,
          lead?.phone,
          "[Novo Contato - WhatsApp]",
        ),
        company: [],
        property_count: summary?.propertyCount ?? 0,
        value: opp.value ?? 0,
        stage_id: opp.stage_id,
        time_in_phase_label: telemetry.hoursInPhaseLabel,
        touchpoints_count: touchpointCounts[opp.lead_id] ?? 0,
        status: opp.status,
        updated_at: opp.updated_at,
      };

      // Flatten custom fields into the row
      const customData = (opp.custom_data ?? {}) as Record<string, unknown>;
      for (const field of schema) {
        row[field.field_id] = customData[field.field_id] ?? null;
      }

      // Sprint 6.8 T3.3 — attach combined lead score for badge rendering
      const s = opp.lead_id ? leadScores[opp.lead_id] : undefined;
      row._lead_score = s?.leadScore ?? null;
      row._lead_breakdown = s ? { icp: s.icpScore, velocity: s.velocity } : undefined;

      return row;
    });
  }, [filteredOpps, leadsById, stagesById, entitySummary, touchpointCounts, schema, leadScores]);

  // Sprint 6.8 T4.2 — sort rows
  const sortedRows: GridRow[] = useMemo(() => {
    if (!sortKey || !sortDir) return gridRows;
    return [...gridRows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [gridRows, sortKey, sortDir]);

  // ---- Cell commit --------------------------------------------------------
  const handleCellCommit = useCallback(
    async (m: CellMutation) => {
      // Sprint 6.7 — opportunity_links relation (companies, properties, etc.)
      if (m.column.relation?.linkTable === "opportunity_links") {
        const value = m.value as
          | { toId: string; label: string; action?: "link" | "remove" }
          | undefined;
        if (!value || !equipeId) return;

        if (value.action === "remove" || value.action === "unlink") {
          // Soft-delete the link row by linked_id
          await supabase
            .from("opportunity_links")
            .update({ deleted_at: new Date().toISOString() })
            .eq("opportunity_id", m.rowId)
            .eq("linked_type", "company")
            .eq("linked_id", value.toId)
            .eq("equipe_id", equipeId);
        } else {
          // Link — insert a new opportunity_links row
          await supabase.from("opportunity_links").insert({
            equipe_id: equipeId,
            opportunity_id: m.rowId,
            linked_type: "company",
            linked_id: value.toId,
            relation: "related",
          });
        }
        // Invalidate relation cache so chips refresh immediately
        queryClient.invalidateQueries({
          queryKey: ["relation", "opp_links", m.rowId],
        });
        return;
      }

      if (m.column.source === "jsonb" && m.column.jsonbField === "custom_data") {
        // Merge into custom_data JSONB
        const opp = opportunities.find((o) => o.id === m.rowId);
        const existing = {
          ...((opp?.custom_data ?? {}) as Record<string, unknown>),
        };
        existing[m.column.key] = m.value;
        await updateOpportunity.mutateAsync({
          id: m.rowId,
          custom_data: existing,
        });
      } else if (m.column.key === "stage_id") {
        await updateOpportunity.mutateAsync({
          id: m.rowId,
          stage_id: m.value as string,
        });
      } else if (m.column.key === "status") {
        const newStatus = m.value as OpportunityStatus;
        await updateOpportunity.mutateAsync({
          id: m.rowId,
          status: newStatus,
          closed_at:
            newStatus === "open"
              ? null
              : new Date().toISOString(),
        });
      } else {
        await updateOpportunity.mutateAsync({
          id: m.rowId,
          [m.column.key]: m.value,
        });
      }
    },
    [updateOpportunity, opportunities, equipeId, queryClient],
  );

  // ---- Mass actions -------------------------------------------------------
  const massActions: MassAction[] = useMemo(
    () => [
      {
        id: "move-stage",
        label: "Mover para etapa",
        icon: <ArrowRight className="h-4 w-4" />,
        run: async (ids: string[]) => {
          setMoveIds(ids);
          setMoveStageId("");
          setMoveDialogOpen(true);
        },
      },
      {
        id: "delete",
        label: "Excluir",
        icon: <Trash2 className="h-4 w-4" />,
        run: async (ids: string[]) => {
          await bulkDeleteOpportunities.mutateAsync(ids);
        },
        destructive: true,
      },
    ],
    [bulkDeleteOpportunities],
  );

  // ---- Sibling rows for detail navigation ---------------------------------
  const siblingsForDetail = useMemo(
    () => filteredOpps,
    [filteredOpps],
  );

  if (isLoading && opportunities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{pipeline?.name ?? "Pipeline"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filteredOpps.length} leads · {schema.length} campos personalizados
            </p>
          </div>
        </div>

        {/* Grid toolbar (search + filters) */}
        <GridToolbar
          search={globalFilter}
          onSearchChange={setGlobalFilter}
          searchPlaceholder="Buscar por lead, email, telefone..."
          filters={[
            {
              key: "stage",
              label: "Etapa",
              value: stageFilter,
              options: stageOptions,
              onChange: setStageFilter,
            },
            {
              key: "status",
              label: "Status",
              value: statusFilter,
              options: statusOptions,
              onChange: setStatusFilter,
            },
          ]}
          onClearFilters={handleClearFilters}
          activeFilterCount={activeFilterCount}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <SpreadsheetGrid
          rows={sortedRows}
          columns={allColumns}
          onCellCommit={handleCellCommit}
          massActions={massActions}
          loading={isLoading}
          equipeId={equipeId}
          fromTable="opportunities"
          onSort={handleSort}
          sortKey={sortKey}
          sortDir={sortDir}
          onResizeColumn={resizeColumn}
        />
      </div>

      {/* Modals */}
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
        siblings={siblingsForDetail}
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

      {/* Sprint 6.8 T4.4 — bulk move to stage */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Mover para etapa</DialogTitle>
            <DialogDescription>
              Mover {moveIds.length} oportunidade
              {moveIds.length !== 1 ? "s" : ""} para qual etapa?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={moveStageId} onValueChange={setMoveStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etapa..." />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMoveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={!moveStageId || bulkMove.isPending}
              onClick={() => {
                bulkMove.mutate(
                  { ids: moveIds, stageId: moveStageId },
                  {
                    onSettled: () => {
                      setMoveDialogOpen(false);
                      setMoveIds([]);
                      setMoveStageId("");
                    },
                  },
                );
              }}
            >
              {bulkMove.isPending ? "Movendo..." : "Mover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
