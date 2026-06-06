import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ExternalLink,
  Home,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useProperties } from "@/hooks/useProperties";
import { ColumnVisibilityDropdown } from "@/components/crm/ColumnVisibilityDropdown";
import { AddPropertyModal } from "./AddPropertyModal";
import { PropertyDetailModal } from "./PropertyDetailModal";

// Sprint 5.3 T10 — toggleable columns (name + row actions always shown).
const PROPERTY_COLUMNS: { id: string; label: string }[] = [
  { id: "property_type", label: "Tipo" },
  { id: "address", label: "Endereço" },
  { id: "created_at", label: "Criado em" },
];

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  address: "Endereço",
  site: "Site",
  unit: "Unidade",
  custom: "Personalizado",
};

const PROPERTY_TYPE_COLOR: Record<string, string> = {
  address: "bg-blue-500/10 text-blue-600 border-blue-200",
  site: "bg-purple-500/10 text-purple-600 border-purple-200",
  unit: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  custom: "bg-gray-500/10 text-gray-600 border-gray-200",
};

/**
 * Sprint 5.3 T2 — Properties database view.
 * Lives under `/crm?tab=properties`.
 * Mirrors CompaniesDatabaseView pattern, lets operators browse, search,
 * create, and drill into all properties in the tenant.
 */
export const PropertiesDatabaseView = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const { properties, isLoading, refetch } = useProperties(search);
  const [showCreate, setShowCreate] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const isVisible = (id: string) => !hidden[id];

  const openId = searchParams.get("property");
  const openDetail = (id: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("property", id);
    else params.delete("property");
    setSearchParams(params, { replace: false });
  };

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
          <ColumnVisibilityDropdown
            columns={PROPERTY_COLUMNS.map((c) => ({ ...c, visible: isVisible(c.id) }))}
            onToggle={(id, visible) =>
              setHidden((prev) => ({ ...prev, [id]: !visible }))
            }
          />
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

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Home className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhuma propriedade encontrada</p>
            <p className="text-xs mt-1">
              {search ? "Tente outro termo de busca." : "Clique em \"Nova Propriedade\" para começar."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome</TableHead>
                  {isVisible("property_type") && <TableHead>Tipo</TableHead>}
                  {isVisible("address") && <TableHead>Endereço</TableHead>}
                  {isVisible("created_at") && <TableHead>Criado em</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openDetail(p.id)}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(p.id);
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{p.label}</TableCell>
                    {isVisible("property_type") && (
                      <TableCell>
                        <Badge variant="outline" className={PROPERTY_TYPE_COLOR[p.property_type] ?? ""}>
                          {PROPERTY_TYPE_LABEL[p.property_type] ?? p.property_type}
                        </Badge>
                      </TableCell>
                    )}
                    {isVisible("address") && (
                      <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate">
                        {p.address
                          ? [p.address.street, p.address.number, p.address.city, p.address.state]
                              .filter(Boolean)
                              .join(", ")
                          : "—"}
                      </TableCell>
                    )}
                    {isVisible("created_at") && (
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
