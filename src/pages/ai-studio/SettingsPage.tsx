import { useState } from "react";
import { MessageSquare, Clock, Webhook, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversaTab } from "./settings/ConversaTab";
import { IdleActionsTab } from "./settings/IdleActionsTab";
import { WebhooksTab } from "./settings/WebhooksTab";
import { TransferRulesTab } from "./settings/TransferRulesTab";

// Sprint 7.3 — this page was a single 287-line file holding one flat settings
// list. It now mirrors the provider's own tab layout so every item on their
// config screen has a home here. Each tab owns its own fetch/save cycle and its
// own upstream resource; they share nothing but this shell.
const TABS = [
  { id: "conversa", label: "Conversa", icon: MessageSquare, Component: ConversaTab },
  { id: "inatividade", label: "Ações de inatividade", icon: Clock, Component: IdleActionsTab },
  { id: "webhooks", label: "Webhooks", icon: Webhook, Component: WebhooksTab },
  { id: "transferencia", label: "Regras de transferência", icon: ArrowRightLeft, Component: TransferRulesTab },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SettingsPage() {
  const [active, setActive] = useState<TabId>("conversa");
  const ActiveComponent = TABS.find((t) => t.id === active)!.Component;

  return (
    <div className="p-6 lg:p-8 max-w-[820px] mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Configurações
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Parâmetros operacionais do agente, sincronizados em tempo real com a API.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Each tab mounts fresh, so switching back re-reads upstream state
          rather than showing a value that may have changed elsewhere. */}
      <ActiveComponent />
    </div>
  );
}
