import { useState } from "react";
import { ChevronRight, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopilotActivitySheet } from "@/components/crm/copilot/CopilotActivitySheet";
import { CopilotChat } from "@/components/crm/copilot/CopilotChat";
import { CopilotSettingsSheet } from "@/components/crm/copilot/CopilotSettingsSheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCopilotFeed } from "@/hooks/useCopilotFeed";
import { useRole } from "@/hooks/useRole";
import { activityLine } from "@/lib/copilotFeed";
import { cn } from "@/lib/utils";

/**
 * Sprint 11 · Onda 6 · T64 — the Copilot's home.
 * Sprint 11 · T68 — it became the app's opening (top of /home, the modules below):
 * the greeting and the question to the revenue machine (the chat, read-only);
 * one line under it opens what waits for a person and what the Copilot did, with
 * undo; the settings behind the gear, for admins.
 */
export function CopilotHome() {
  const { profile } = useAuth();
  const { isAdmin } = useRole();
  const { feed, resolve, undo } = useCopilotFeed();
  const [activityOpen, setActivityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const line = activityLine(feed);
  const firstName = profile?.nome_completo?.trim().split(/\s+/)[0];
  const admin = isAdmin();

  const onResolve = (id: string, approve: boolean) => {
    setBusyId(id);
    resolve.mutate({ id, approve }, { onSettled: () => setBusyId(null) });
  };
  const onUndo = (id: string) => {
    setBusyId(id);
    undo.mutate(id, { onSettled: () => setBusyId(null) });
  };

  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 md:pb-14">
        <div className="flex h-9 justify-end">
          {admin && (
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5 text-muted-foreground">
              <Settings className="h-4 w-4" />
              Configurar
            </Button>
          )}
        </div>

        <CopilotChat
          greeting={firstName ? `Olá, ${firstName}` : "Olá"}
          footer={
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className={cn("h-2 w-2 rounded-full", line.attention ? "bg-primary" : "bg-muted-foreground/40")} />
              {line.text}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          }
        />
      </div>

      <CopilotActivitySheet
        open={activityOpen}
        onOpenChange={setActivityOpen}
        feed={feed}
        busyId={busyId}
        onResolve={onResolve}
        onUndo={onUndo}
      />
      {admin && <CopilotSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </section>
  );
}
