import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  flexRender,
} from "@tanstack/react-table";
import { useLeads, Lead } from "@/hooks/useLeads";
import { useLeadEntitySummary } from "@/hooks/useLeadEntitySummary";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnVisibilityDropdown } from "@/components/crm/ColumnVisibilityDropdown";
import { BulkActions } from "./BulkActions";
import { ImportModal } from "./ImportModal";
import { ExportModal } from "./ExportModal";
import { useNavigate } from "react-router-dom";
import { ContactDetailsModal } from "./ContactDetailsModal";
import { AssignToPipelineDialog } from "./AssignToPipelineDialog";
import { AddContactModal } from "./AddContactModal";
import {
  ArrowUpDown,
  Search,
  Download,
  Upload,
  RefreshCw,
  UserPlus,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Building2,
  Briefcase,
  Home,
  Check,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { isTechnicalId, formatBrPhone, formatDisplayName } from "@/lib/displayName";

// Componente de célula editável inline
interface EditableCellProps {
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "number" | "currency";
  placeholder?: string;
}

const EditableCell = ({ value, onSave, type = "text", placeholder = "-" }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || "");

  const handleSave = () => {
    if (localValue !== (value || "")) {
      onSave(localValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setLocalValue(value || "");
      setIsEditing(false);
    }
  };

  const formatDisplayValue = () => {
    if (!value) return placeholder;
    if (type === "currency") {
      const num = parseFloat(value);
      return isNaN(num) ? placeholder : `R$ ${num.toLocaleString("pt-BR")}`;
    }
    return value;
  };

  if (isEditing) {
    return (
      <Input
        autoFocus
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 min-w-[100px] border-primary"
        type={type === "number" || type === "currency" ? "number" : "text"}
      />
    );
  }

  return (
    <div
      onClick={() => {
        setLocalValue(value || "");
        setIsEditing(true);
      }}
      className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded min-h-[32px] flex items-center"
    >
      {formatDisplayValue()}
    </div>
  );
};

// Componente de select editável inline
interface EditableSelectProps {
  value: string | null;
  options: { id: string; label: string; color?: string }[];
  onSave: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
}

const EditableSelect = ({ value, options, onSave, placeholder = "Selecionar", allowClear = false }: EditableSelectProps) => {
  return (
    <Select
      value={value || "__none__"}
      onValueChange={(val) => onSave(val === "__none__" ? null : val)}
    >
      <SelectTrigger className="h-8 border-transparent hover:border-input focus:border-primary bg-transparent min-w-[120px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value="__none__">-</SelectItem>}
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id}>
            <div className="flex items-center gap-2">
              {opt.color && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />
              )}
              {opt.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// Componente de checkbox editável
interface EditableCheckboxProps {
  checked: boolean;
  onSave: (checked: boolean) => void;
  label?: string;
}

const EditableCheckbox = ({ checked, onSave, label }: EditableCheckboxProps) => {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        onCheckedChange={(val) => onSave(!!val)}
      />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
};

type LeadUpdateValue = string | number | boolean | null | string[] | undefined;

// Sprint 5.3 T10/T11 — labels for the shared column visibility dropdown.
// Enrichment columns (cf_*) fall through to their raw JSONB key as the label.
const COLUMN_LABELS: Record<string, string> = {
  name: "Nome",
  email: "Email",
  phone: "Telefone",
  company_link: "Empresa",
  property_count: "Imóveis",
  origin_category: "Origem",
  channel: "Canal",
  enrichment_summary: "Enriquecimento IA",
  observations: "Observações",
  tags: "Tags",
  created_at: "Criado em",
};

export const DatabaseView = () => {
  const navigate = useNavigate();
  const { leads, isLoading, updateLead, deleteLead, refetch } = useLeads();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  // Sprint 5.5 2.4 — Quick Add Contact drawer. Single-row manual entry
  // sits next to the bulk Importar/Exportar buttons. The batch upload
  // engine is the existing ImportModal (Sprint 4); Quick Add is the
  // companion micro-flow for "just one contact now".
  const [showAddModal, setShowAddModal] = useState(false);

  // Sprint 4 EPIC 2 — clicking the row's open icon pops the contact drawer so
  // users can jump from Base de Contatos to a contact's Opportunities.
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Sprint 4 EPIC 4 §4.3.1 — "Assign Contact to Pipeline" single-row flow.
  // Bulk flow (same dialog, multiple ids) runs through BulkActions.
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null);

  // Filter states
  const handleUpdateField = useCallback((leadId: string, field: string, value: LeadUpdateValue) => {
    updateLead.mutate({ id: leadId, [field]: value });
  }, [updateLead]);

  // Sprint 5.5 2.3 — surface Canal + Enriquecimento as first-class columns
  // so operators can scan the entire pipeline-origin landscape from the
  // ledger view without opening each contact's drawer.
  const channelOptions = [
    { id: "whatsapp", label: "WhatsApp" },
    { id: "instagram", label: "Instagram" },
    { id: "telegram", label: "Telegram" },
    { id: "messenger", label: "Messenger" },
    { id: "web", label: "Web / Widget" },
  ];

  const originCategoryOptions = useMemo(
    () => ORIGIN_CATEGORY_OPTIONS.map((option) => ({ id: option.value, label: option.label })),
    [],
  );

  const creationSourceOptions = [
    { id: "ai_agent", label: "IA (Solo Agent)" },
    { id: "manual", label: "Manual" },
    { id: "webhook", label: "Webhook" },
    { id: "import", label: "Import (CSV)" },
  ];

  const filteredLeads = useMemo(() => {
    return leads;
  }, [leads]);

  const filteredLeadIds = useMemo(
    () => filteredLeads.map((lead) => lead.id),
    [filteredLeads],
  );
  const { data: entitySummary = {} } = useLeadEntitySummary(filteredLeadIds);

  // T6 — Raio-X de Enriquecimento: desempacotar chaves do JSONB em colunas ordenáveis
  const enrichmentColumns = useMemo((): ColumnDef<Lead>[] => {
    const keySet = new Set<string>();
    filteredLeads.forEach((lead) => {
      if (lead.personal_custom_data && typeof lead.personal_custom_data === "object") {
        Object.keys(lead.personal_custom_data).forEach((k) => keySet.add(k));
      }
    });

    const knownLabels: Record<string, string> = {
      job_title: "Cargo",
      linkedin_url: "LinkedIn",
      instagram_url: "Instagram",
      birthday: "Aniversário",
      company: "Empresa",
      website: "Site",
      industry: "Setor",
      location: "Localização",
      facebook_url: "Facebook",
      twitter_url: "Twitter",
    };

    const fmtLabel = (k: string) =>
      knownLabels[k] ||
      k
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return Array.from(keySet).map((key) => ({
      id: `enrichment_${key}`,
      header: fmtLabel(key),
      accessorFn: (row: Lead) => {
        const data = row.personal_custom_data as Record<string, unknown> | null | undefined;
        if (!data || data[key] === undefined || data[key] === null) return "";
        return String(data[key]);
      },
      cell: ({ getValue }) => {
        const value = getValue<string>();
        if (!value) return <span className="text-muted-foreground">-</span>;
        if (value.startsWith("http://") || value.startsWith("https://")) {
          return (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline truncate block max-w-[200px]"
              title={value}
            >
              {value.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          );
        }
        return (
          <span className="truncate block max-w-[200px]" title={value}>
            {value}
          </span>
        );
      },
      enableSorting: true,
    }));
  }, [filteredLeads]);

  const columns: ColumnDef<Lead>[] = useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Selecionar todos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Selecionar linha"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "open",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Abrir detalhes do contato"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLead(row.original);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Adicionar a uma pipeline"
            title="Adicionar a uma pipeline"
            onClick={(e) => {
              e.stopPropagation();
              setAssigningLead(row.original);
            }}
          >
            <Briefcase className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent font-semibold"
        >
          Nome
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        // Sprint 5.5 — mask Meta technical IDs (e.g. "264162...@lid") so they
        // never reach the user. The raw value stays editable; only the read
        // view is blanked, and the phone is offered as a helpful placeholder.
        const rawName = row.getValue("name") as string | null;
        const phone = row.original.phone as string | null;
        const isMasked = isTechnicalId(rawName);
        const phoneHint = formatBrPhone(phone);
        return (
          <EditableCell
            value={isMasked ? "" : (rawName ?? "")}
            onSave={(val) => handleUpdateField(row.original.id, "name", val)}
            placeholder={isMasked ? (phoneHint || "[Lead Anônimo]") : "Nome..."}
          />
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Telefone",
      cell: ({ row }) => {
        const phone = row.getValue("phone") as string;
        return (
          <div className="flex items-center gap-2">
            <EditableCell
              value={phone}
              onSave={(val) => handleUpdateField(row.original.id, "phone", val)}
              placeholder="-"
            />
            {phone && phone.length >= 10 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:text-green-700 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  const cleanPhone = phone.replace(/\D/g, "");
                  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                  window.open(`https://wa.me/${formattedPhone}`, "_blank");
                }}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            {/* T15 — Sales Engine Chat Route: open this contact's native thread */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary hover:text-primary/80 shrink-0"
              title="Abrir no chat do Sales Engine"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/chat?contact=${row.original.id}`);
              }}
            >
              <MessagesSquare className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <EditableCell
          value={row.getValue("email")}
          onSave={(val) => handleUpdateField(row.original.id, "email", val)}
          placeholder="-"
        />
      ),
    },
    {
      id: "company_link",
      header: "Empresa",
      cell: ({ row }) => {
        const summary = entitySummary[row.original.id];
        if (!summary?.companyName) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="flex items-center gap-1.5 max-w-[180px]">
            <Badge
              variant="outline"
              className="text-xs gap-1 max-w-full justify-start"
              title={summary.companyName}
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{summary.companyName}</span>
            </Badge>
            {summary.companyCount > 1 && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                +{summary.companyCount - 1}
              </Badge>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: "property_count",
      header: "Imóveis",
      cell: ({ row }) => {
        const count = entitySummary[row.original.id]?.propertyCount ?? 0;
        return (
          <Badge
            variant={count > 0 ? "secondary" : "outline"}
            className="text-xs gap-1 min-w-[44px] justify-center"
            title={`${count} imóvel${count === 1 ? "" : "is"} vinculado${count === 1 ? "" : "s"}`}
          >
            <Home className="h-3 w-3" />
            {count}
          </Badge>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "origin_category",
      header: "Origem",
      cell: ({ row }) => (
        <EditableSelect
          value={row.original.origin_category ?? null}
          options={originCategoryOptions}
          onSave={(val) => handleUpdateField(row.original.id, "origin_category", val)}
          placeholder="Origem"
          allowClear
        />
      ),
    },
    {
      // Sprint 5.5 2.3
      accessorKey: "channel",
      header: "Canal",
      cell: ({ row }) => (
        <EditableSelect
          value={(row.getValue("channel") as string) || null}
          options={channelOptions}
          onSave={(val) => handleUpdateField(row.original.id, "channel", val)}
          placeholder="Canal"
          allowClear
        />
      ),
    },
    ...enrichmentColumns,
    {
      accessorKey: "observations",
      header: "Observações",
      cell: ({ row }) => (
        <EditableCell
          value={row.getValue("observations")}
          onSave={(val) => handleUpdateField(row.original.id, "observations", val)}
          placeholder="-"
        />
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags = row.getValue("tags") as string[] | null;
        if (!tags || tags.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex gap-1 flex-wrap max-w-[150px]">
            {tags.slice(0, 2).map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 2}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent font-semibold"
        >
          Criado em
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("created_at"));
        return <span className="text-sm">{format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>;
      },
    },
  ], [channelOptions, entitySummary, handleUpdateField, originCategoryOptions, enrichmentColumns]);

  const table = useReactTable({
    data: filteredLeads,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Sprint 5.5 2.1 — Infinite scroll: pagination model removed so all
    // filtered rows render under one scrollable viewport. Filtering at the
    // useLeads layer (deleted_at IS NULL + equipe_id) keeps the working set
    // bounded; if a tenant ever crosses ~5k contacts we'll layer row
    // virtualization on top — but for now this beats the pagination clicks.
    enableRowSelection: true,
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedLeads = selectedRows.map(row => row.original);

  const handleRefresh = () => {
    refetch();
    toast.success("Dados atualizados!");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Base de <span className="text-primary">Contatos</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredLeads.length} contatos • {selectedLeads.length} selecionados • Clique para editar
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

      {/* Filters & Actions */}
      <div className="p-4 border-b border-border bg-card/50 space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Global Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, telefone..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Column Visibility — Sprint 5.3 T10 shared component. Enrichment
              columns (cf_*) carry their JSONB key as the label automatically. */}
          <ColumnVisibilityDropdown
            columns={table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => ({
                id: col.id,
                label: COLUMN_LABELS[col.id] || col.id,
                visible: col.getIsVisible(),
              }))}
            onToggle={(id, visible) => table.getColumn(id)?.toggleVisibility(visible)}
          />
        </div>

        {/* Bulk Actions */}
        {selectedLeads.length > 0 && (
          <BulkActions
            selectedLeads={selectedLeads}
            onClearSelection={() => setRowSelection({})}
          />
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/30">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="hover:bg-muted/30"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-1">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    Nenhum contato encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
        leads={selectedLeads.length > 0 ? selectedLeads : filteredLeads}
        allLeads={filteredLeads}
        selectedCount={selectedLeads.length}
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
        open={!!assigningLead}
        onClose={() => setAssigningLead(null)}
        contactIds={assigningLead ? [assigningLead.id] : []}
        label={assigningLead ? formatDisplayName(assigningLead.name, assigningLead.phone, "[Novo Contato - WhatsApp]") : undefined}
      />
    </div>
  );
};
