import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  flexRender,
} from "@tanstack/react-table";
import { useLeads, Lead } from "@/hooks/useLeads";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useTeamMembers } from "@/hooks/useTeamMembers";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkActions } from "./BulkActions";
import { ImportModal } from "./ImportModal";
import { ExportModal } from "./ExportModal";
import { LeadDetailsModal } from "./LeadDetailsModal";
import {
  ArrowUpDown,
  Columns,
  Search,
  Download,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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

export const DatabaseView = () => {
  const { leads, isLoading, updateLead, deleteLead, refetch } = useLeads();
  const { stages } = usePipelineStages();
  const { teamMembers: members } = useTeamMembers();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Sprint 4 EPIC 2 — clicking the row's open icon pops the contact drawer so
  // users can jump from Base de Contatos to a contact's Opportunities.
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Filter states
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const handleUpdateField = useCallback((leadId: string, field: string, value: any) => {
    updateLead.mutate({ id: leadId, [field]: value });
  }, [updateLead]);

  const stageOptions = useMemo(() => 
    stages.map(s => ({ id: s.id, label: s.name, color: s.color })),
    [stages]
  );

  const memberOptions = useMemo(() => 
    members.map(m => ({ id: m.id, label: m.nome_completo || m.email || "Usuário" })),
    [members]
  );

  const sourceOptions = [
    { id: "Manual", label: "Manual" },
    { id: "IA", label: "IA" },
    { id: "Ads", label: "Ads" },
  ];

  const typeOptions = [
    { id: "lead", label: "Lead" },
    { id: "contact", label: "Contato" },
    { id: "spam", label: "Spam" },
    { id: "archived", label: "Arquivado" },
  ];

  const filteredLeads = useMemo(() => {
    let result = leads;

    if (stageFilter && stageFilter !== "all") {
      result = result.filter(lead => lead.stage_id === stageFilter);
    }

    if (responsibleFilter && responsibleFilter !== "all") {
      result = result.filter(lead => lead.responsible_id === responsibleFilter);
    }

    if (typeFilter && typeFilter !== "all") {
      result = result.filter(lead => lead.lead_type === typeFilter);
    }

    return result;
  }, [leads, stageFilter, responsibleFilter, typeFilter]);

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
      cell: ({ row }) => (
        <EditableCell
          value={row.getValue("name")}
          onSave={(val) => handleUpdateField(row.original.id, "name", val)}
          placeholder="Nome..."
        />
      ),
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
      accessorKey: "lead_type",
      header: "Tipo",
      cell: ({ row }) => (
        <EditableSelect
          value={row.getValue("lead_type")}
          options={typeOptions}
          onSave={(val) => handleUpdateField(row.original.id, "lead_type", val)}
          placeholder="Tipo"
        />
      ),
    },
    {
      accessorKey: "stage_id",
      header: "Etapa",
      cell: ({ row }) => {
        const stageId = row.getValue("stage_id") as string | null;
        const stage = stages.find(s => s.id === stageId);
        return (
          <EditableSelect
            value={stageId}
            options={stageOptions}
            onSave={(val) => handleUpdateField(row.original.id, "stage_id", val)}
            placeholder="Etapa"
            allowClear
          />
        );
      },
    },
    {
      accessorKey: "responsible_id",
      header: "Responsável",
      cell: ({ row }) => (
        <EditableSelect
          value={row.getValue("responsible_id")}
          options={memberOptions}
          onSave={(val) => handleUpdateField(row.original.id, "responsible_id", val)}
          placeholder="Responsável"
          allowClear
        />
      ),
    },
    {
      accessorKey: "opportunity_value",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent font-semibold"
        >
          Valor
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("opportunity_value") as number | null;
        return (
          <EditableCell
            value={value?.toString() || ""}
            onSave={(val) => handleUpdateField(row.original.id, "opportunity_value", parseFloat(val) || 0)}
            type="currency"
            placeholder="-"
          />
        );
      },
    },
    {
      accessorKey: "source",
      header: "Origem",
      cell: ({ row }) => (
        <EditableSelect
          value={row.getValue("source")}
          options={sourceOptions}
          onSave={(val) => handleUpdateField(row.original.id, "source", val)}
          placeholder="Origem"
          allowClear
        />
      ),
    },
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
      accessorKey: "meeting_scheduled",
      header: "Reunião Ag.",
      cell: ({ row }) => (
        <EditableCheckbox
          checked={row.getValue("meeting_scheduled") || false}
          onSave={(val) => handleUpdateField(row.original.id, "meeting_scheduled", val)}
        />
      ),
    },
    {
      accessorKey: "meeting_done",
      header: "Reunião Ok",
      cell: ({ row }) => (
        <EditableCheckbox
          checked={row.getValue("meeting_done") || false}
          onSave={(val) => handleUpdateField(row.original.id, "meeting_done", val)}
        />
      ),
    },
    {
      accessorKey: "no_show",
      header: "No Show",
      cell: ({ row }) => (
        <EditableCheckbox
          checked={row.getValue("no_show") || false}
          onSave={(val) => handleUpdateField(row.original.id, "no_show", val)}
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
  ], [stages, members, stageOptions, memberOptions, sourceOptions, typeOptions, handleUpdateField]);

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
    getPaginationRowModel: getPaginationRowModel(),
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
            Database <span className="text-primary">Leads</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredLeads.length} leads • {selectedLeads.length} selecionados • Clique para editar
          </p>
        </div>
        <div className="flex gap-2">
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

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {typeOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stage Filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    {stage.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Responsible Filter */}
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.nome_completo || member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns className="h-4 w-4 mr-2" />
                Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[400px] overflow-y-auto">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => {
                  const labelMap: Record<string, string> = {
                    name: "Nome",
                    email: "Email",
                    phone: "Telefone",
                    lead_type: "Tipo",
                    stage_id: "Etapa",
                    responsible_id: "Responsável",
                    opportunity_value: "Valor",
                    source: "Origem",
                    observations: "Observações",
                    tags: "Tags",
                    meeting_scheduled: "Reunião Ag.",
                    meeting_done: "Reunião Ok",
                    no_show: "No Show",
                    created_at: "Criado em",
                  };
                  return (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    >
                      {labelMap[col.id] || col.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Bulk Actions */}
        {selectedLeads.length > 0 && (
          <BulkActions
            selectedLeads={selectedLeads}
            stages={stages}
            members={members}
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
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
        <div className="text-sm text-muted-foreground">
          Página {table.getState().pagination.pageIndex + 1} de{" "}
          {table.getPageCount() || 1}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Próxima
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Modals */}
      <ImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        stages={stages}
        members={members}
      />
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        leads={selectedLeads.length > 0 ? selectedLeads : filteredLeads}
        allLeads={filteredLeads}
        selectedCount={selectedLeads.length}
      />
      <LeadDetailsModal
        lead={selectedLead}
        stages={stages}
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
    </div>
  );
};