import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { useCompanies } from "@/hooks/useCompanies";
import { SpreadsheetGrid } from "@/components/crm/grid/SpreadsheetGrid";
import type { CellMutation, ColumnDef, GridRow } from "@/components/crm/grid/types";
import { AddCompanyModal } from "./AddCompanyModal";
import { CompanyDetailModal } from "./CompanyDetailModal";

// Sprint 15 · T8 — no column is editable here: this screen never saved a cell
// (edits happen in the detail modal), so the grid is read-only.
const COMPANY_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Nome", kind: "text", source: "native", editable: false, primary: true, width: 220 },
  { key: "industry", label: "Setor", kind: "text", source: "native", editable: false },
  { key: "cnpj", label: "CNPJ", kind: "text", source: "native", editable: false },
  { key: "size_bracket", label: "Tamanho", kind: "text", source: "native", editable: false, width: 120 },
  { key: "contacts", label: "Contatos", kind: "number", source: "native", editable: false, width: 110 },
  { key: "properties", label: "Propriedades", kind: "number", source: "native", editable: false, width: 130 },
  { key: "website", label: "Website", kind: "url", source: "native", editable: false },
];

const noCommit = async (_m: CellMutation) => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Sprint 4 EPIC 4 — Companies database view. Lives under `/crm?tab=companies`.
 * Sprint 15 · T8 — rendered by the shared CRM grid.
 */
export const CompaniesDatabaseView = () => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const { companies, isLoading, error, refetch } = useCompanies(search);
  const [showCreate, setShowCreate] = useState(false);

  const openId = searchParams.get("company");
  const openDetail = (id: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("company", id);
    else params.delete("company");
    setSearchParams(params, { replace: false });
  };

  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);

  // Link counters — one round-trip each, cached per tenant+companies snapshot.
  const { data: contactCounts = {} as Record<string, number> } = useQuery<
    Record<string, number>
  >({
    queryKey: ["companies_contact_counts", equipeId, companyIds.sort().join(",")],
    enabled: !!equipeId && companyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("contact_company_links")
        .select("company_id")
        .in("company_id", companyIds)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ company_id: string }>) {
        counts[row.company_id] = (counts[row.company_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const { data: propertyCounts = {} as Record<string, number> } = useQuery<
    Record<string, number>
  >({
    queryKey: ["companies_property_counts", equipeId, companyIds.sort().join(",")],
    enabled: !!equipeId && companyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("property_owner_links")
        .select("owner_id")
        .eq("owner_type", "company")
        .in("owner_id", companyIds)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ owner_id: string }>) {
        counts[row.owner_id] = (counts[row.owner_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const gridRows: GridRow[] = useMemo(
    () =>
      companies.map((c) => ({
        id: c.id,
        equipe_id: c.equipe_id,
        name: c.name ?? "",
        industry: c.industry ?? "",
        cnpj: c.cnpj ?? "",
        size_bracket: c.size_bracket ?? "",
        contacts: contactCounts[c.id] ?? 0,
        properties: propertyCounts[c.id] ?? 0,
        website: c.website ?? "",
      })),
    [companies, contactCounts, propertyCounts],
  );

  // On a phone each company is a line: name; sector · size; contact counter.
  const renderMobileRow = useCallback((row: GridRow) => {
    const facts = [row.industry, row.size_bracket].filter(Boolean).join(" · ");
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{(row.name as string) || "—"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{facts || "Sem setor"}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.contacts as number} {row.contacts === 1 ? "contato" : "contatos"}
        </span>
      </div>
    );
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <p className="text-sm text-muted-foreground">
            {companies.length} {companies.length === 1 ? "empresa" : "empresas"} • Clique no nome para abrir
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Empresa
          </Button>
        </div>
      </div>

      <div className="p-4 border-b border-border bg-card/50">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, razão social ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {error && gridRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-destructive">
            Não foi possível carregar as empresas.
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <SpreadsheetGrid
            rows={gridRows}
            columns={COMPANY_COLUMNS}
            onCellCommit={noCommit}
            massActions={[]}
            loading={isLoading}
            surfaceKey="crm-companies"
            allowColumnReorder
            allowColumnResize
            allowColumnHide
            onRowOpen={(id) => openDetail(id)}
            renderMobileRow={renderMobileRow}
            mobileEmptyLabel="Nenhuma empresa encontrada."
            hasMore={false}
          />
        )}
      </div>

      <AddCompanyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(created) => openDetail(created.id)}
      />

      <CompanyDetailModal
        companyId={openId}
        open={!!openId}
        onClose={() => openDetail(null)}
      />
    </div>
  );
};
