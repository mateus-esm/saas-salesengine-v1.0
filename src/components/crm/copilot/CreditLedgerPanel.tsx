// src/components/crm/copilot/CreditLedgerPanel.tsx
//
// Sprint 6.1 · EPIC F · F3 — Transparency Ledger.
//
// Matches the 6.1 vision's Transparency Ledger: Data/Hora · Oportunidade/Canal ·
// Ações Executadas · Modo (Auto/Manual) · Custo (créditos). Rows are grouped by
// decision_id where present so one sync pulse reads as one line with its action
// count. Managers-only (useRole → billing requires owner).

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRole } from "@/hooks/useRole";
import { useCreditLedger, type CreditLedgerRow } from "@/hooks/useCopilotCredits";

interface LedgerGroup {
  key: string;
  created_at: string;
  opportunity_id: string | null;
  leadName: string | null;
  verbs: string[];
  mode: "auto" | "manual";
  cost: number;
}

function groupRows(rows: CreditLedgerRow[]): LedgerGroup[] {
  const map = new Map<string, LedgerGroup>();
  for (const r of rows) {
    // One pulse = one decision_id; ungrouped rows stand alone by id.
    const key = r.decision_id || r.id;
    const existing = map.get(key);
    if (existing) {
      existing.verbs.push(r.verb);
      existing.cost += r.credits_charged;
    } else {
      map.set(key, {
        key,
        created_at: r.created_at,
        opportunity_id: r.opportunity_id,
        leadName: r.lead?.name ?? null,
        verbs: [r.verb],
        mode: r.mode,
        cost: r.credits_charged,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );
}

export function CreditLedgerPanel() {
  const { hasRole } = useRole();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data: rows = [], isLoading } = useCreditLedger({
    from: from || undefined,
    to: to ? `${to}T23:59:59` : undefined,
  });

  const groups = useMemo(() => groupRows(rows), [rows]);

  if (!hasRole("owner")) {
    return (
      <p className="text-sm text-muted-foreground">
        Apenas gestores podem ver o consumo de créditos do Copilot.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          De
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
        </label>
        <label className="text-xs text-muted-foreground">
          Até
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </label>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data / Hora</TableHead>
              <TableHead>Lead / Canal</TableHead>
              <TableHead>Ações Executadas</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead className="text-right">Custo (créditos)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum consumo no período.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(g.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-xs">
                  {g.leadName ?? (g.opportunity_id ? g.opportunity_id.slice(0, 8) : "—")}
                </TableCell>
                <TableCell className="text-xs">
                  {g.verbs.join(", ")}
                  {g.verbs.length > 1 && (
                    <span className="ml-1 text-muted-foreground">({g.verbs.length} ações)</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={g.mode === "auto" ? "default" : "secondary"}>
                    {g.mode === "auto" ? "Auto" : "Manual"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">-{g.cost}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
