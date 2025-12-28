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
import { TableFilters } from "./TableFilters";
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
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const DatabaseView = () => {
  const { leads, isLoading, updateLead, deleteLead, refetch } = useLeads();
  const { stages } = usePipelineStages();
  const { teamMembers: members } = useTeamMembers();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Filter states
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");

  const getStageById = useCallback((id: string | null) => stages.find(s => s.id === id), [stages]);
  const getMemberById = useCallback((id: string | null) => members.find(m => m.id === id), [members]);

  const filteredLeads = useMemo(() => {
    let result = leads;

    if (stageFilter && stageFilter !== "all") {
      result = result.filter(lead => lead.stage_id === stageFilter);
    }

    if (responsibleFilter && responsibleFilter !== "all") {
      result = result.filter(lead => lead.responsible_id === responsibleFilter);
    }

    return result;
  }, [leads, stageFilter, responsibleFilter]);

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
        />
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
          className="p-0 hover:bg-transparent"
        >
          Nome
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => row.getValue("email") || "-",
    },
    {
      accessorKey: "phone",
      header: "Telefone",
      cell: ({ row }) => {
        const phone = row.getValue("phone") as string;
        if (!phone) return "-";

        const cleanPhone = phone.replace(/\D/g, "");
        const canWhatsApp = cleanPhone.length >= 10;

        return (
          <div className="flex items-center gap-2">
            <span>{phone}</span>
            {canWhatsApp && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:text-green-700"
                onClick={(e) => {
                  e.stopPropagation();
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
      accessorKey: "stage_id",
      header: "Etapa",
      cell: ({ row }) => {
        const stage = getStageById(row.getValue("stage_id"));
        return stage ? (
          <Badge
            style={{ backgroundColor: stage.color, color: "#fff" }}
            className="font-normal"
          >
            {stage.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: "responsible_id",
      header: "Responsável",
      cell: ({ row }) => {
        const member = getMemberById(row.getValue("responsible_id"));
        return member?.nome_completo || "-";
      },
    },
    {
      accessorKey: "opportunity_value",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent"
        >
          Valor
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("opportunity_value") as number;
        return value ? `R$ ${value.toLocaleString("pt-BR")}` : "-";
      },
    },
    {
      accessorKey: "source",
      header: "Origem",
      cell: ({ row }) => {
        const source = row.getValue("source") as string;
        return source || "-";
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags = row.getValue("tags") as string[] | null;
        if (!tags || tags.length === 0) return "-";
        return (
          <div className="flex gap-1 flex-wrap">
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
      accessorKey: "meeting_scheduled",
      header: "Reunião",
      cell: ({ row }) => {
        const scheduled = row.getValue("meeting_scheduled") as boolean;
        const done = row.original.meeting_done;
        const noShow = row.original.no_show;

        if (noShow) return <Badge variant="destructive">No Show</Badge>;
        if (done) return <Badge className="bg-green-600">Realizada</Badge>;
        if (scheduled) return <Badge className="bg-blue-600">Agendada</Badge>;
        return "-";
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent"
        >
          Criado em
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("created_at"));
        return format(date, "dd/MM/yyyy", { locale: ptBR });
      },
    },
  ], [stages, members, getStageById, getMemberById]);

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

  const handleRowClick = (lead: Lead) => {
    setSelectedLead(lead);
    setShowDetailsModal(true);
  };

  const handleUpdateLead = (data: { id: string } & Partial<Lead>) => {
    updateLead.mutate(data);
    setShowDetailsModal(false);
    setSelectedLead(null);
  };

  const handleDeleteLead = (id: string) => {
    deleteLead.mutate(id);
    setShowDetailsModal(false);
    setSelectedLead(null);
  };

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
            {filteredLeads.length} leads • {selectedLeads.length} selecionados
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

          {/* Stage Filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
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
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  >
                    {col.id === "name" ? "Nome" :
                      col.id === "email" ? "Email" :
                        col.id === "phone" ? "Telefone" :
                          col.id === "stage_id" ? "Etapa" :
                            col.id === "responsible_id" ? "Responsável" :
                              col.id === "opportunity_value" ? "Valor" :
                                col.id === "source" ? "Origem" :
                                  col.id === "tags" ? "Tags" :
                                    col.id === "meeting_scheduled" ? "Reunião" :
                                      col.id === "created_at" ? "Criado em" : col.id}
                  </DropdownMenuCheckboxItem>
                ))}
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={(e) => {
                          if (cell.column.id === "select" || cell.column.id === "phone") {
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
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-4 border-t border-border bg-card">
        <p className="text-sm text-muted-foreground">
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} linhas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Modals */}
      <LeadDetailsModal
        lead={selectedLead}
        stages={stages}
        open={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedLead(null);
        }}
        onSave={handleUpdateLead}
        onDelete={handleDeleteLead}
      />

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
    </div>
  );
};
