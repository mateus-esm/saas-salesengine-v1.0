// src/components/crm/copilot/CopilotCentralPanel.tsx
//
// Sprint 6.3 · Epic 5 — "Central do Copiloto" tab content.
//
// Thin container that renders the credit/action ledger inside the per-pipeline
// CRM workspace. All ledger logic lives in CreditLedgerPanel.

import { ScrollText } from "lucide-react";
import { CreditLedgerPanel } from "./CreditLedgerPanel";

export function CopilotCentralPanel() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Central do Copiloto
            </h2>
            <p className="text-xs text-muted-foreground">
              Histórico de ações e consumo de créditos do Copilot.
            </p>
          </div>
        </div>

        {/* Ledger */}
        <CreditLedgerPanel />
      </div>
    </div>
  );
}
