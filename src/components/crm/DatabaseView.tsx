import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Download, Loader2, RefreshCw, Trash2, Upload, UserPlus } from "lucide-react";

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
import { ContactColumnsToolbar } from "@/components/crm/ContactColumnsToolbar";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import type { MassAction } from "@/components/crm/grid/MassActionBar";
import type { CellMutation, ColumnDef, GridRow } from "@/components/crm/grid/types";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useContactFields } from "@/hooks/useContactFields";
import {
  fetchAllContacts,
  useContactCellUpdate,
  useContactsCount,
  useContactsRealtime,
  useContactsTable,
  useDeleteContacts,
} from "@/hooks/useContactsTable";
import { useLead } from "@/hooks/useLead";
import { useLeadMutations } from "@/hooks/useLeads";
import { usePipelines } from "@/hooks/usePipelines";
import { useContactUrlFilters } from "@/hooks/useUrlFilters";
import { isTechnicalId } from "@/lib/displayName";
import { columnFromField } from "@/lib/fields/columns";
import { flattenPages } from "@/lib/tablePages";
import { cn } from "@/lib/utils";
import type { ContactRelationship, CrmSort } from "@/types/crmFilters";
import type { ContactDeal } from "@/types/crmTables";

import { AddContactModal } from "./AddContactModal";
import { AssignToPipelineDialog } from "./AssignToPipelineDialog";
import { ContactDetailsModal } from "./ContactDetailsModal";
import { ExportModal } from "./ExportModal";
import { UserAvatar } from "./fields/UserAvatar";
import { ContactFilterBar } from "./filters/ContactFilterBar";
import { countContactFilters, RELATIONSHIP_LABELS } from "./filters/model";
import { ImportModal } from "./ImportModal";

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "messenger", label: "Messenger" },
  { value: "web", label: "Web / Widget" },
];

const RELATIONSHIP_STYLE: Record<ContactRelationship, string> = {
  cliente: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  negociando: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  perdido: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  sem_negocio: "bg-muted text-muted-foreground",
};

/** Grid column ↔ the server's sort key (crm_contacts_table). */
const SORTABLE: Record<string, string> = {
  name: "name",
  created_at: "created_at",
  won_value: "won_value",
  last_won_at: "last_won_at",
  next_contact: "next_contact",
};

/**
 * Sprint 11 · Onda 2 · T19 — the contact base, from the server.
 *
 * A contact has no owner of its own: responsibility lives on the deal. So the
 * base shows who the contact is and what they have with the company — its deals
 * (pipeline · stage, with each owner), its relationship (derived from the
 * deals), total won and last win. Pages of 50 from crm_contacts_table; filters in
 * the URL; the row's name opens the contact (the modal never opened here before).
 */
export const DatabaseView = () => {
  const navigate = useNavigate();
  const { activePipelines } = usePipelines();
  const { fields: contactFields, isLoading: isLoadingContactFields, createField } = useContactFields();

  const { filters, setFilters, sort, setSort } = useContactUrlFilters();
  const query = useContactsTable(filters, sort);
  const count = useContactsCount(filters);
  useContactsRealtime();
  const rows = useMemo(() => flattenPages(query.data), [query.data]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const deleteMany = useDeleteContacts(filters, sort);
  const updateCell = useContactCellUpdate(filters, sort);
  const { updateLead, deleteLead } = useLeadMutations();

  // ---- Modals ---------------------------------------------------------------
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const openLead = useLead(openLeadId);
  const [assignPipelineIds, setAssignPipelineIds] = useState<string[]>([]);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);

  const visibleContactFields = useMemo(
    () => contactFields.filter((f) => !f.is_deleted).sort((a, b) => a.position - b.position),
    [contactFields],
  );

  const openDeal = useCallback(
    (deal: ContactDeal) =>
      navigate(`/crm?tab=pipeline&pipeline=${deal.pipeline_id}&view=kanban&opp=${deal.id}`),
    [navigate],
  );

  // ---- Columns --------------------------------------------------------------
  const columns: ColumnDef[] = useMemo(() => {
    const native: ColumnDef[] = [
      { key: "name", label: "Nome", kind: "text", source: "native", editable: false, primary: true, width: 200 },
      { key: "phone", label: "Telefone", kind: "phone", source: "native" },
      { key: "email", label: "E-mail", kind: "text", source: "native" },
      { key: "company_name", label: "Empresa", kind: "text", source: "native", editable: false },
      {
        key: "relationship",
        label: "Situação",
        kind: "text",
        source: "native",
        editable: false,
        width: 120,
        render: (v) => {
          const rel = v as ContactRelationship;
          return (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", RELATIONSHIP_STYLE[rel])}>
              {RELATIONSHIP_LABELS[rel] ?? "—"}
            </span>
          );
        },
      },
      {
        key: "deals",
        label: "Negócios",
        kind: "text",
        source: "native",
        editable: false,
        width: 260,
        render: (v) => {
          const deals = (v as ContactDeal[]) ?? [];
          if (deals.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <>
              {deals.slice(0, 3).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeal(d);
                  }}
                  className={cn(
                    "inline-flex max-w-[11rem] shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] hover:border-primary/60",
                    d.status !== "open" && "opacity-70",
                  )}
                  title={`${d.pipeline_name} · ${d.stage_name}${d.owner_name ? ` · ${d.owner_name}` : " · sem responsável"}`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.stage_color ?? "currentColor" }} />
                  <span className="truncate">{d.stage_name}</span>
                  <UserAvatar userId={d.owner_id} name={d.owner_name} size="xs" />
                </button>
              ))}
              {deals.length > 3 && <span className="text-[11px] text-muted-foreground">+{deals.length - 3}</span>}
            </>
          );
        },
      },
      { key: "won_value", label: "Ganho total", kind: "currency", source: "native", editable: false },
      { key: "last_won_at", label: "Último ganho", kind: "date", source: "native", editable: false },
      {
        key: "origin_category",
        label: "Origem",
        kind: "select",
        source: "native",
        options: ORIGIN_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      { key: "channel", label: "Canal", kind: "select", source: "native", options: CHANNEL_OPTIONS },
      { key: "next_contact", label: "Próximo contato", kind: "date", source: "native" },
      { key: "tags", label: "Etiquetas", kind: "multi_select", source: "native", editable: false },
      { key: "observations", label: "Observações", kind: "text", source: "native" },
      { key: "created_at", label: "Criado em", kind: "date", source: "native", editable: false },
    ];
    const enrichment = visibleContactFields.map((f) => columnFromField(f, "personal_custom_data", "key"));
    return [...native, ...enrichment];
  }, [openDeal, visibleContactFields]);

  // ---- Rows -----------------------------------------------------------------
  const gridRows: GridRow[] = useMemo(
    () =>
      rows.map((c) => {
        const row: GridRow = {
          id: c.id,
          equipe_id: c.equipe_id,
          name: isTechnicalId(c.name) ? c.phone ?? "" : c.name ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
          company_name: c.company_name ?? "",
          relationship: c.relationship,
          deals: c.deals,
          won_value: c.won_value,
          last_won_at: c.last_won_at,
          origin_category: c.origin_category ?? "",
          channel: c.channel ?? "",
          next_contact: c.next_contact,
          tags: c.tags,
          observations: c.observations ?? "",
          created_at: c.created_at,
        };
        for (const f of visibleContactFields) row[f.key] = c.personal_custom_data?.[f.key] ?? null;
        return row;
      }),
    [rows, visibleContactFields],
  );

  // ---- Sort -----------------------------------------------------------------
  const gridSortKey = sort ? Object.keys(SORTABLE).find((k) => SORTABLE[k] === sort.key) : undefined;
  const handleSort = useCallback(
    (key: string, dir: "asc" | "desc" | null) => {
      if (!dir) return setSort(null);
      const server = SORTABLE[key];
      if (server) setSort({ key: server, dir } as CrmSort);
    },
    [setSort],
  );

  // ---- Cell commit ----------------------------------------------------------
  const handleCellCommit = useCallback(
    async (m: CellMutation) => {
      const contact = rowById.get(m.rowId);
      if (!contact) return;
      if (m.column.source === "jsonb" && m.column.jsonbField === "personal_custom_data") {
        await updateCell(contact.id, {
          personal_custom_data: { ...(contact.personal_custom_data ?? {}), [m.column.key]: m.value },
        });
        return;
      }
      await updateCell(contact.id, { [m.column.key]: m.value === "" ? null : m.value });
    },
    [rowById, updateCell],
  );

  // ---- Bulk actions ---------------------------------------------------------
  const massActions: MassAction[] = useMemo(
    () => [
      {
        id: "assign_pipeline",
        label: "Adicionar a pipeline",
        icon: <Briefcase className="mr-1 h-4 w-4" />,
        run: async (ids) => setAssignPipelineIds(ids),
      },
      {
        id: "delete",
        label: "Excluir",
        icon: <Trash2 className="mr-1 h-4 w-4" />,
        run: async (ids) => setConfirmDeleteIds(ids),
        destructive: true,
      },
    ],
    [],
  );

  const total = count.data ?? 0;
  const filtered = countContactFilters(filters) > 0;
  const resultLabel = count.isLoading
    ? "…"
    : `${total.toLocaleString("pt-BR")} ${filtered ? (total === 1 ? "encontrado" : "encontrados") : total === 1 ? "contato" : "contatos"}`;

  if (query.isLoading && rows.length === 0 && !query.isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Base de <span className="text-primary">Contatos</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quem são os contatos e o que eles têm com a empresa. O responsável fica em cada negócio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="border-0 bg-gradient-to-r from-solo-orange to-solo-yellow text-white shadow-sm hover:from-solo-orange/90 hover:to-solo-yellow/90"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Adicionar Contato
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowExportModal(true)}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <ContactFilterBar
              filters={filters}
              onChange={setFilters}
              pipelines={activePipelines.map((p) => ({ id: p.id, name: p.name }))}
              resultLabel={resultLabel}
            />
          </div>
          <ContactColumnsToolbar
            onCreate={(field) => createField.mutate(field)}
            existingKeys={contactFields.map((f) => f.key)}
            disabled={isLoadingContactFields || createField.isPending}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        {query.isError ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-destructive">
            Não foi possível carregar os contatos.
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
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
            surfaceKey="base_contatos"
            allowColumnReorder
            allowColumnResize
            allowColumnHide
            onSort={handleSort}
            sortKey={gridSortKey}
            sortDir={sort?.dir ?? null}
            onRowOpen={(id) => setOpenLeadId(id)}
            hasMore={!!query.hasNextPage}
            loadingMore={query.isFetchingNextPage}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
          />
        )}
      </div>

      {/* Modals */}
      <AddContactModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={() => setShowAddModal(false)} />
      <ImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        total={total}
        loadRows={() => fetchAllContacts(filters, sort)}
      />
      <ContactDetailsModal
        lead={openLead.data ?? null}
        open={!!openLeadId && !!openLead.data}
        onClose={() => setOpenLeadId(null)}
        onSave={(data) => {
          updateLead.mutate(data);
          setOpenLeadId(null);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setOpenLeadId(null);
        }}
      />
      <AssignToPipelineDialog
        open={assignPipelineIds.length > 0}
        onClose={() => setAssignPipelineIds([])}
        contactIds={assignPipelineIds}
      />
      <AlertDialog open={confirmDeleteIds.length > 0} onOpenChange={(o) => !o && setConfirmDeleteIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir {confirmDeleteIds.length} {confirmDeleteIds.length === 1 ? "contato" : "contatos"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMany.mutate(confirmDeleteIds);
                setConfirmDeleteIds([]);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
