import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CopilotApprovals } from "@/components/crm/copilot/CopilotApprovals";
import { CopilotFeed } from "@/components/crm/copilot/CopilotFeed";
import type { CopilotFeed as CopilotFeedData } from "@/lib/copilotFeed";

interface CopilotActivitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feed: CopilotFeedData;
  busyId: string | null;
  onResolve: (id: string, approve: boolean) => void;
  onResolveMany: (ids: string[], approve: boolean) => void;
  isResolvingMany?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onUndo: (id: string) => void;
}

/**
 * Sprint 11 · T68 — what waits for a person and what the Copilot did, behind the
 * home's one line, so the opening stays just the conversation.
 */
export function CopilotActivitySheet({
  open,
  onOpenChange,
  feed,
  busyId,
  onResolve,
  onResolveMany,
  isResolvingMany,
  isLoading,
  isError,
  onRetry,
  onUndo,
}: CopilotActivitySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>Atividade do Copilot</SheetTitle>
          <SheetDescription>O que espera você e o que ele fez nos últimos 7 dias.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <CopilotApprovals
            items={feed.pending}
            busyId={busyId}
            onResolve={onResolve}
            onResolveMany={onResolveMany}
            isResolvingMany={isResolvingMany}
            isLoading={isLoading}
            isError={isError}
            onRetry={onRetry}
          />
          <CopilotFeed feed={feed} busyId={busyId} onUndo={onUndo} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
