// src/components/crm/copilot/CopilotSidebar.tsx
//
// Sprint 6.8 W1.1 — Sidebar navigation for the Copilot Cockpit.
// Lists agents, pipelines, training, and approvals with elegant
// hover/active states.

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LayoutList,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Pipeline } from "@/types/pipelines";

// ── Sidebar selection type ──────────────────────────────────────
// Chat agent intentionally excluded (founder point 17: "dont have for now
// this option of chat").
export type SidebarItem =
  | "contact_base"
  | "training"
  | "approvals"
  | { type: "pipeline"; id: string };

// ── Props ───────────────────────────────────────────────────────
interface CopilotSidebarProps {
  pipelines: Pipeline[];
  selected: SidebarItem | null;
  onSelect: (item: SidebarItem) => void;
}

// ── Helpers ─────────────────────────────────────────────────────
function isSelected(item: SidebarItem, current: SidebarItem | null): boolean {
  if (current === null) return false;
  if (typeof item === "string" && typeof current === "string") return item === current;
  if (typeof item === "object" && typeof current === "object")
    return item.type === current.type && item.id === current.id;
  return false;
}

// ── Sidebar items config ────────────────────────────────────────
const TOP_ITEMS = [
  { id: "contact_base" as const, icon: Users, label: "Base de Contatos" },
];

const BOTTOM_ITEMS = [
  { id: "training" as const, icon: BookOpen, label: "Treinamento" },
  { id: "approvals" as const, icon: CheckCircle2, label: "Aprovações" },
];

// ── Component ───────────────────────────────────────────────────
export function CopilotSidebar({
  pipelines,
  selected,
  onSelect,
}: CopilotSidebarProps) {
  const [pipelinesOpen, setPipelinesOpen] = useState(false);

  return (
    <aside className="w-[260px] shrink-0 border-r border-border bg-card flex flex-col h-full select-none">
      {/* ── Top section: agents ── */}
      <div className="p-3 pt-4 space-y-1">
        <div className="px-3 pb-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Agentes
          </h2>
        </div>

        {TOP_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
              isSelected(item.id, selected)
                ? "bg-primary/10 text-primary font-medium border-l-[3px] border-primary"
                : "text-foreground/70 hover:text-foreground hover:bg-accent/60 border-l-[3px] border-transparent",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── Pipelines section ── */}
      <div className="px-3 space-y-1">
        <button
          type="button"
          onClick={() => setPipelinesOpen(!pipelinesOpen)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
            "text-foreground/70 hover:text-foreground hover:bg-accent/60",
          )}
        >
          <LayoutList className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Pipelines</span>
          {pipelinesOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        <div
          className={cn(
            "grid transition-all duration-200",
            pipelinesOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="ml-3 pl-3 border-l border-border space-y-0.5 py-1">
              {pipelines.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 px-3">
                  Nenhum pipeline ativo
                </p>
              )}
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect({ type: "pipeline", id: p.id })}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-all",
                    isSelected({ type: "pipeline", id: p.id }, selected)
                      ? "bg-primary/10 text-primary font-medium border-l-[3px] border-primary"
                      : "text-foreground/60 hover:text-foreground hover:bg-accent/60 border-l-[3px] border-transparent",
                  )}
                >
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom section: training + approvals ── */}
      <div className="mt-auto p-3 space-y-1 border-t border-border pt-3">
        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
              isSelected(item.id, selected)
                ? "bg-primary/10 text-primary font-medium border-l-[3px] border-primary"
                : "text-foreground/70 hover:text-foreground hover:bg-accent/60 border-l-[3px] border-transparent",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
