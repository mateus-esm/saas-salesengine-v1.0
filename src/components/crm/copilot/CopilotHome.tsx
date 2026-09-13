import { useState } from "react";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopilotApprovals } from "@/components/crm/copilot/CopilotApprovals";
import { CopilotChat } from "@/components/crm/copilot/CopilotChat";
import { CopilotFeed } from "@/components/crm/copilot/CopilotFeed";
import { CopilotSettingsSheet } from "@/components/crm/copilot/CopilotSettingsSheet";
import { useCopilotFeed } from "@/hooks/useCopilotFeed";

/**
 * Sprint 11 · Onda 6 · T64 — CRM › Copilot: the home.
 *
 * Ask the revenue machine anything (the chat, read-only); below, what waits for
 * a person and what the Copilot did, with undo; the settings behind the gear.
 */
export function CopilotHome() {
  const { feed, resolve, undo } = useCopilotFeed();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onResolve = (id: string, approve: boolean) => {
    setBusyId(id);
    resolve.mutate({ id, approve }, { onSettled: () => setBusyId(null) });
  };
  const onUndo = (id: string) => {
    setBusyId(id);
    undo.mutate(id, { onSettled: () => setBusyId(null) });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Copilot</h1>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5">
            <Settings className="h-4 w-4" />
            Configurar
          </Button>
        </div>

        <CopilotChat />

        <div className="grid gap-4 lg:grid-cols-2">
          <CopilotApprovals items={feed.pending} busyId={busyId} onResolve={onResolve} />
          <CopilotFeed feed={feed} busyId={busyId} onUndo={onUndo} />
        </div>
      </div>
      <CopilotSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
