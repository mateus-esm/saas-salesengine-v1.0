import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useProperties } from "@/hooks/useProperties";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import type { CellMutation, ColumnDef, GridRow } from "@/components/crm/grid/types";
import { AddPropertyModal } from "./AddPropertyModal";
import { PropertyDetailModal } from "./PropertyDetailModal";

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  address: "Endereço",
  site: "Site",
  unit: "Unidade",
  custom: "Personalizado",
};

// Sprint 15 · T8 — no column is editable here: this screen never saved a cell
// (edits happen in the detail modal), so the grid is read-only.
const PROPERTY_COLUMNS: ColumnDef[] = [
  { key: "label", label: "Nome", kind: "text", source: "native", editable: false, primary: true, width: 220 },
  {
    key: "property_type",
    label: "Tipo",
    kind: "select",
    source: "native",
    editable: false,
    width: 140,
    options: Object.entries(PROPERTY_TYPE_LABEL).map(([value, label]) => ({ value, label })),
  },
  { key: "address", label: "Endereço", kind: "text", source: "native", editable: false, width: 300 },
  { key: "created_at", label: "Criado em", kind: "date", source: "native", editable: false, width: 130 },
];

const noCommit = async (_m: CellMutation) => {};

/**
 * Sprint 5.3 T2 — Properties database view. Lives under `/crm?tab=properties`.
 * Sprint 15 · T8 — rendered by the shared CRM grid.
 */
export const PropertiesDatabaseView = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const { properties, isLoading, error, refetch } = useProperties(search);
  const [showCreate, setShowCreate] = useState(false);

  const openId = searchParams.get("property");
  const openDetail = (id: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("property", id);
    else params.delete("property");
    setSearchParams(params, { replace: false });
  };

  const gridRows: GridRow[] = useMemo(
    () =>
      properties.map((p) => ({
        id: p.id,
        equipe_id: p.equipe_id,
        label: p.label ?? "",
        property_type: p.property_type,
        address: p.address
          ? [p.address.street, p.address.number, p.address.city, p.address.state].filter(Boolean).join(", ")
          : "",
        created_at: p.created_at,
      })),
    [properties],
  );

  // On a phone each property is a line: name; type · address.
  const renderMobileRow = useCallback((row: GridRow) => {
    const facts = [PROPERTY_TYPE_LABEL[row.property_type as string] ?? row.property_type, row.address]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{(row.label as string) || "—"}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{facts}</p>
      </div>
    );
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Propriedade
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {error && gridRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-destructive">
            Não foi possível carregar as propriedades.
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <SpreadsheetGrid
            rows={gridRows}
            columns={PROPERTY_COLUMNS}
            onCellCommit={noCommit}
            massActions={[]}
            loading={isLoading}
            surfaceKey="crm-properties"
            allowColumnReorder
            allowColumnResize
            allowColumnHide
            onRowOpen={(id) => openDetail(id)}
            renderMobileRow={renderMobileRow}
            mobileEmptyLabel={search ? "Nenhuma propriedade com esse termo." : "Nenhuma propriedade encontrada."}
            hasMore={false}
          />
        )}
      </div>

      {/* Modals */}
      <AddPropertyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(property) => {
          setShowCreate(false);
          openDetail(property.id);
        }}
      />

      <PropertyDetailModal
        propertyId={openId}
        open={!!openId}
        onClose={() => openDetail(null)}
      />
    </div>
  );
};
