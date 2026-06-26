import { useState, useMemo, useCallback } from "react";
import { useLeads, Lead } from "@/hooks/useLeads";
import { useLeadEntitySummary } from "@/hooks/useLeadEntitySummary";
import { useContactFields } from "@/hooks/useContactFields";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { Button } from "@/components/ui/button";
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
import { ContactColumnsToolbar } from "@/components/crm/ContactColumnsToolbar";
import { GridToolbar } from "@/components/crm/grid/GridToolbar";
import { ImportModal } from "./ImportModal";
import { ExportModal } from "./ExportModal";
import { ContactDetailsModal } from "./ContactDetailsModal";
import { AssignToPipelineDialog } from "./AssignToPipelineDialog";
import { AddContactModal } from "./AddContactModal";
import {
  Download,
  Upload,
  RefreshCw,
  UserPlus,
  Loader2,
  Briefcase,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { isTechnicalId } from "@/lib/displayName";

// — Grid imports ----------------------------------------------------------
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import type { ColumnDef, CellMutation, GridRow } from "@/components/crm/grid/types";
import type { MassAction } from "@/components/crm/grid/MassActionBar";

// ---------------------------------------------------------------------------
// Helper — map CustomFieldType to grid ColumnKind
// ---------------------------------------------------------------------------
function toColumnKind(type: string): ColumnDef["kind"] {
  switch (type) {
    case "number": return "number";
    case "select": return "select";
    case "date":   return "date";
    default:       return "text";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const DatabaseView = () => {
  const { leads, isLoading, updateLead, deleteLead, refetch } = useLeads();
  const {
    fields: contactFields,
    isLoading: isLoadingContactFields,
    createField,
    deleteField,
  } = useContactFields();

  // ---- Modals state ------------------------------------------------------
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null);

  // ---- Mass-action dialog state ------------------------------------------
  const [assignPipelineIds, setAssignPipelineIds] = useState<string[]>([]);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---- Filter ------------------------------------------------------------
  const [globalFilter, setGlobalFilter] = useState("");

  // ---- Derived -----------------------------------------------------------
  const filteredLeads = useMemo(() => {
    if (!globalFilter) return leads;
    const q = globalFilter.toLowerCase();
    return leads.filter(
      (lead) =>
        (lead.name && lead.name.toLowerCase().includes(q)) ||
        (lead.email && lead.email.toLowerCase().includes(q)) ||
        (lead.phone && lead.phone.includes(q)),
    );
  }, [leads, globalFilter]);

  const filteredLeadIds = useMemo(
    () => filteredLeads.map((l) => l.id),
    [filteredLeads],
  );

  const { data: entitySummary = {} } = useLeadEntitySummary(filteredLeadIds);

  const visibleContactFields = useMemo(
    () =>
      contactFields
        .filter((field) => !field.is_deleted)
        .sort((a, b) => a.position - b.position),
    [contactFields],
  );

  // ---- Options for select columns ----------------------------------------
  const originCategoryOptions = useMemo(
    () =>
      ORIGIN_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const channelOptions = [
    { value: "whatsapp", label: "WhatsApp" },
    { value: "instagram", label: "Instagram" },
    { value: "telegram", label: "Telegram" },
    { value: "messenger", label: "Messenger" },
    { value: "web", label: "Web / Widget" },
  ];

  // ---- Column definitions ------------------------------------------------
  const nativeColumns: ColumnDef[] = useMemo(
    () => [
      {
        key: "name",
        label: "Nome",
        kind: "text",
        source: "native",
      },
      {
        key: "phone",
        label: "Telefone",
        kind: "text",
        source: "native",
      },
      {
        key: "email",
        label: "Email",
        kind: "text",
        source: "native",
      },
      {
        key: "company_link",
        label: "Empresa",
        kind: "text",
        source: "native",
        editable: false,
      },
      {
        key: "property_count",
        label: "Imóveis",
        kind: "number",
        source: "native",
        editable: false,
      },
      {
        key: "origin_category",
        label: "Origem",
        kind: "select",
        source: "native",
        options: originCategoryOptions,
      },
      {
        key: "channel",
        label: "Canal",
        kind: "select",
        source: "native",
        options: channelOptions,
      },
      {
        key: "observations",
        label: "Observações",
        kind: "text",
        source: "native",
      },
      {
        key: "tags",
        label: "Tags",
        kind: "text",
        source: "native",
        editable: false,
      },
      {
        key: "created_at",
        label: "Criado em",
        kind: "date",
        source: "native",
        editable: false,
      },
    ],
    [originCategoryOptions],
  );

  const enrichmentColumns: ColumnDef[] = useMemo(
    () =>
      visibleContactFields.map((field) => ({
        key: field.key,
        label: field.label,
        kind: toColumnKind(field.type),
        source: "jsonb" as const,
        jsonbField: "personal_custom_data" as const,
      })),
    [visibleContactFields],
  );

  const allColumns = useMemo(
    () => [...nativeColumns, ...enrichmentColumns],
    [nativeColumns, enrichmentColumns],
  );

  // ---- Flat row builder --------------------------------------------------
  const gridRows: GridRow[] = useMemo(
    () =>
      filteredLeads.map((lead) => {
        const summary = entitySummary[lead.id];
        const customData = (lead.personal_custom_data ?? {}) as Record<
          string,
          unknown
        >;
        const row: GridRow = {
          id: lead.id,
          equipe_id: lead.equipe_id,
          name: isTechnicalId(lead.name) ? "" : (lead.name ?? ""),
          phone: lead.phone ?? "",
          email: lead.email ?? "",
          company_link: summary?.companyName ?? "",
          property_count: summary?.propertyCount ?? 0,
          origin_category: lead.origin_category ?? "",
          channel: lead.channel ?? "",
          observations: lead.observations ?? "",
          tags: (lead.tags ?? []).join(", "),
          created_at: lead.created_at,
        };
        // Flatten enrichment fields into the row
        for (const field of visibleContactFields) {
          row[field.key] = customData[field.key] ?? "";
        }
        return row;
      }),
    [filteredLeads, entitySummary, visibleContactFields],
  );

  // ---- Cell commit handler -----------------------------------------------
  const handleCellCommit = useCallback(
    async (m: CellMutation) => {
      if (m.column.source === "jsonb" && m.column.jsonbField === "personal_custom_data") {
        const lead = leads.find((l) => l.id === m.rowId);
        const existing = {
          ...((lead?.personal_custom_data ?? {}) as Record<string, unknown>),
        };
        existing[m.column.key] = m.value;
        await updateLead.mutateAsync({
          id: m.rowId,
          personal_custom_data: existing,
        });
      } else {
        await updateLead.mutateAsync({ id: m.rowId, [m.column.key]: m.value });
      }
    },
    [updateLead, leads],
  );

  // ---- Mass actions ------------------------------------------------------
  const massActions: MassAction[] = useMemo(
    () => [
      {
        id: "assign_pipeline",
        label: "Adicionar a Pipeline",
        icon: <Briefcase className="h-4 w-4 mr-1" />,
        run: async (ids: string[]) => {
          setAssignPipelineIds(ids);
        },
        destructive: false,
      },
      {
        id: "delete",
        label: "Excluir",
        icon: <Trash2 className="h-4 w-4 mr-1" />,
        run: async (ids: string[]) => {
          setConfirmDeleteIds(ids);
        },
        destructive: true,
      },
    ],
    [],
  );

  // ---- Bulk delete handler -----------------------------------------------
  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      for (const id of confirmDeleteIds) {
        await deleteLead.mutateAsync(id);
      }
      toast.success(`${confirmDeleteIds.length} contato${confirmDeleteIds.length === 1 ? "" : "s"} removido${confirmDeleteIds.length === 1 ? "" : "s"}!`);
      setConfirmDeleteIds([]);
    } catch {
      toast.error("Erro ao remover contatos");
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- Refresh -----------------------------------------------------------
  const handleRefresh = () => {
    refetch();
    toast.success("Dados atualizados!");
  };

  // ---- Loading state -----------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ---- Render ------------------------------------------------------------
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Base de <span className="text-primary">Contatos</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredLeads.length} contatos
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-solo-orange to-solo-yellow hover:from-solo-orange/90 hover:to-solo-yellow/90 text-white border-0 shadow-sm"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Adicionar Contato
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowExportModal(true)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="p-4 border-b border-border bg-card/50">
        <GridToolbar
          search={globalFilter}
          onSearchChange={setGlobalFilter}
          searchPlaceholder="Buscar por nome, email, telefone..."
          filters={[]}
          onClearFilters={() => {}}
          activeFilterCount={0}
        >
          <ContactColumnsToolbar
            onCreate={(field) => createField.mutate(field)}
            existingKeys={contactFields.map((field) => field.key)}
            disabled={isLoadingContactFields || createField.isPending}
          />
        </GridToolbar>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <SpreadsheetGrid
          rows={gridRows}
          columns={allColumns}
          onCellCommit={handleCellCommit}
          massActions={massActions}
          loading={isLoading}
          surfaceKey="base_contatos"
          allowColumnReorder
          allowColumnResize
          allowColumnHide
        />
      </div>

      {/* Modals */}
      <AddContactModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => setShowAddModal(false)}
      />
      <ImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        leads={filteredLeads}
        allLeads={filteredLeads}
        selectedCount={0}
      />
      <ContactDetailsModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onSave={(data) => {
          updateLead.mutate(data);
          setSelectedLead(null);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setSelectedLead(null);
        }}
      />
      <AssignToPipelineDialog
        open={assignPipelineIds.length > 0}
        onClose={() => setAssignPipelineIds([])}
        contactIds={assignPipelineIds}
      />
      <AlertDialog
        open={confirmDeleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteIds([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {confirmDeleteIds.length} contato
              {confirmDeleteIds.length > 1 ? "s" : ""}? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
