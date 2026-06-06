import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
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

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { useCompanies } from "@/hooks/useCompanies";
import { ColumnVisibilityDropdown } from "@/components/crm/ColumnVisibilityDropdown";
import { AddCompanyModal } from "./AddCompanyModal";
import { CompanyDetailModal } from "./CompanyDetailModal";

// Sprint 5.3 T10 — toggleable columns (name + row actions always shown).
const COMPANY_COLUMNS: { id: string; label: string }[] = [
  { id: "industry", label: "Setor" },
  { id: "cnpj", label: "CNPJ" },
  { id: "size_bracket", label: "Tamanho" },
  { id: "contacts", label: "Contatos" },
  { id: "properties", label: "Propriedades" },
  { id: "website", label: "Website" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Sprint 4 EPIC 4 — Companies database view. Lives under `/crm?tab=companies`.
 * Intentionally lighter than the Base de Contatos table: we surface the key
 * identity fields and the two relational counters (contacts / properties) so
 * operators can see data density at a glance before drilling in.
 */
export const CompaniesDatabaseView = () => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const { companies, isLoading, refetch } = useCompanies(search);
  const [showCreate, setShowCreate] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const isVisible = (id: string) => !hidden[id];

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            <span className="text-primary">Empresas</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {companies.length} empresas • Clique em uma linha para editar
          </p>
        </div>
        <div className="flex gap-2">
          <ColumnVisibilityDropdown
            columns={COMPANY_COLUMNS.map((c) => ({ ...c, visible: isVisible(c.id) }))}
            onToggle={(id, visible) =>
              setHidden((prev) => ({ ...prev, [id]: !visible }))
            }
          />
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

      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8"></TableHead>
                <TableHead>Nome</TableHead>
                {isVisible("industry") && <TableHead>Setor</TableHead>}
                {isVisible("cnpj") && <TableHead>CNPJ</TableHead>}
                {isVisible("size_bracket") && <TableHead>Tamanho</TableHead>}
                {isVisible("contacts") && <TableHead className="text-center">Contatos</TableHead>}
                {isVisible("properties") && <TableHead className="text-center">Propriedades</TableHead>}
                {isVisible("website") && <TableHead>Website</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((c) => (
                  <TableRow
                    key={c.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => openDetail(c.id)}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(c.id);
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    {isVisible("industry") && (
                      <TableCell className="text-sm text-muted-foreground">
                        {c.industry || "—"}
                      </TableCell>
                    )}
                    {isVisible("cnpj") && (
                      <TableCell className="text-sm text-muted-foreground">
                        {c.cnpj || "—"}
                      </TableCell>
                    )}
                    {isVisible("size_bracket") && (
                      <TableCell className="text-sm text-muted-foreground">
                        {c.size_bracket || "—"}
                      </TableCell>
                    )}
                    {isVisible("contacts") && (
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {contactCounts[c.id] ?? 0}
                        </Badge>
                      </TableCell>
                    )}
                    {isVisible("properties") && (
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {propertyCounts[c.id] ?? 0}
                        </Badge>
                      </TableCell>
                    )}
                    {isVisible("website") && (
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {c.website || "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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
