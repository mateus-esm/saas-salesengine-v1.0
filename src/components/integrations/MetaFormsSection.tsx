// Sprint 17 · Fase 3 — formulários instantâneos das páginas ativas: leads
// recebidos e "Importar leads recentes" (o Meta guarda ~90 dias).

import { useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMetaForms } from "@/hooks/useMeta";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function MetaFormsSection({ hasActivePage }: { hasActivePage: boolean }) {
  const { forms, refreshForms, importRecent } = useMetaForms(hasActivePage);
  const [days, setDays] = useState("30");

  if (!hasActivePage) return null;
  const list = forms.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Formulários</p>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["7", "30", "90"].map((d) => <SelectItem key={d} value={d}>Últimos {d} dias</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Buscar formulários no Meta"
            onClick={() => refreshForms.mutate()} disabled={refreshForms.isPending}>
            {refreshForms.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {forms.isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Nenhum formulário ainda. Eles aparecem quando o primeiro lead chega ou quando você clica em atualizar.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate">{f.name.replace(/^Meta · /, "")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {f.leads} lead(s) · último {when(f.last_lead_at)}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={importRecent.isPending}
                onClick={() => importRecent.mutate({ formId: f.meta_form_id, days: Number(days) })}>
                {importRecent.isPending && importRecent.variables?.formId === f.meta_form_id
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Download className="mr-1.5 h-3.5 w-3.5" />}
                Importar leads recentes
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Cada formulário é uma entrada em <Link to="/crm?tab=campanhas" className="underline">Growth › Entradas</Link>:
        lá você escolhe o funil, o responsável e a campanha padrão. Leads importados não recebem saudação automática.
      </p>
    </div>
  );
}
