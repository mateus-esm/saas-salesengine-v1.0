import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, FileText, Loader2, Plus, Rocket, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProposalDialog } from "./ProposalDialog";
import { formatBRL, formatDate } from "@/hooks/useBilling";

const STATUS: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  enviada:  { label: "Enviada",  className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  vista:    { label: "Vista",    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  aceita:   { label: "Aceita",   className: "bg-green-500/10 text-green-700 dark:text-green-300" },
  recusada: { label: "Recusada", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  expirada: { label: "Expirada", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

export interface ProposalRow {
  id: string;
  codigo: string;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_whatsapp: string | null;
  cliente_doc: string | null;
  setup_price: number;
  monthly_price: number;
  list_monthly_price: number | null;
  term_months: number | null;
  valid_until: string | null;
  status: string;
  equipe_id: string | null;
  created_at: string;
}

/**
 * Sprint 8 T15 — the proposals manager.
 *
 * Replaces manager.html, whose entire pipeline lived in one browser's
 * localStorage and died with the cache.
 */
export function ProposalsTab() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [editing, setEditing] = useState<ProposalRow | null | "new">(null);
  const [provisioning, setProvisioning] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: proposals, isLoading } = useQuery({
    queryKey: ["admin-proposals"],
    queryFn: async (): Promise<ProposalRow[]> => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, codigo, cliente_nome, cliente_email, cliente_whatsapp, cliente_doc, setup_price, monthly_price, list_monthly_price, term_months, valid_until, status, equipe_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProposalRow[];
    },
  });

  const rows = (proposals ?? []).filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.cliente_nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q);
  });

  // Funnel value counts what is still winnable — a lost deal is not pipeline.
  const stats = {
    total: proposals?.length ?? 0,
    sent: proposals?.filter((p) => ["enviada", "vista"].includes(p.status)).length ?? 0,
    accepted: proposals?.filter((p) => p.status === "aceita").length ?? 0,
    funnel: (proposals ?? [])
      .filter((p) => ["enviada", "vista"].includes(p.status))
      .reduce((s, p) => s + Number(p.monthly_price ?? 0), 0),
  };
  const conversion = stats.total ? Math.round((stats.accepted / stats.total) * 100) : 0;

  const copyLink = async (codigo: string) => {
    const url = `${window.location.origin}/proposta/${codigo}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: url });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const provision = async (p: ProposalRow) => {
    setProvisioning(p.id);
    try {
      const { data, error } = await supabase.functions.invoke("provision-tenant", {
        body: { proposal_id: p.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const warnings = (data?.warnings ?? []) as string[];
      toast({
        title: data?.already_provisioned ? "Ambiente já existia" : "Ambiente criado",
        description: warnings.length
          ? `Atenção: ${warnings.join(" · ")}`
          : "Equipe, contrato e faturas criados. O cliente recebeu o convite.",
        variant: warnings.length ? "destructive" : undefined,
      });
      qc.invalidateQueries({ queryKey: ["admin-proposals"] });
    } catch (e) {
      toast({
        title: "Falha ao provisionar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setProvisioning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Propostas" value={String(stats.total)} />
        <Stat label="Em aberto" value={String(stats.sent)} />
        <Stat label="Conversão" value={`${conversion}%`} />
        <Stat label="Funil mensal" value={formatBRL(stats.funnel)} />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente ou código"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setEditing("new")}>
          <Plus className="w-4 h-4 mr-1.5" /> Nova proposta
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !rows.length ? (
            <div className="py-16 text-center">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma proposta encontrada.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((p) => {
                const s = STATUS[p.status] ?? STATUS.rascunho;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="text-sm font-semibold hover:underline"
                          onClick={() => setEditing(p)}
                        >
                          {p.cliente_nome}
                        </button>
                        <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>
                        <code className="text-[10px] font-mono text-muted-foreground">{p.codigo}</code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatBRL(p.monthly_price)}/mês
                        {Number(p.setup_price) > 0 && ` · setup ${formatBRL(p.setup_price)}`}
                        {p.valid_until && ` · válida até ${formatDate(p.valid_until)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => copyLink(p.codigo)} title="Copiar link">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button asChild size="sm" variant="ghost" title="Abrir proposta">
                        <a href={`/proposta/${p.codigo}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      {p.status === "aceita" && !p.equipe_id && (
                        <Button size="sm" disabled={provisioning !== null} onClick={() => provision(p)}>
                          {provisioning === p.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Rocket className="w-3.5 h-3.5 mr-1.5" /> Provisionar</>}
                        </Button>
                      )}
                      {p.equipe_id && (
                        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-300">
                          Provisionada
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ProposalDialog
        proposal={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}
