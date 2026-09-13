// src/pages/CopilotCockpit.tsx
//
// Sprint 6.8 W1.1 — Copilot Cockpit.
// Sprint 11 · Onda 6 · T64 — the cockpit became the Copilot's home: the chat
// ("Entenda como está sua máquina de receita"), what waits for approval and what
// the Copilot did (with undo). The configuration moved behind "Configurar".
// Gated behind equipe.is_crm_agent_enabled.

import { Bot } from "lucide-react";

import { CopilotHome } from "@/components/crm/copilot/CopilotHome";
import { useAuth } from "@/contexts/AuthContext";

const CopilotCockpit = () => {
  const { equipe } = useAuth();

  if (!equipe?.is_crm_agent_enabled) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold text-foreground">Agente de CRM inativo</h2>
          <p className="text-sm text-muted-foreground">
            Ative o Agente de CRM nas configurações da equipe para conversar com o Copilot e deixá-lo manter os negócios em
            dia.
          </p>
        </div>
      </div>
    );
  }

  return <CopilotHome />;
};

export default CopilotCockpit;
