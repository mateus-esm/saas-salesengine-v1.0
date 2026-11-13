// Sprint 15b · T3 — a seção "Follow-ups" do negócio: lista + "Agendar follow-up".

import { useState } from "react";
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FollowupDialog } from "./FollowupDialog";
import { FollowupList } from "./FollowupList";

interface DealFollowupsSectionProps {
  opportunityId: string;
  ownerId: string | null;
  stageName?: (id: string) => string | null;
  title?: string | null;
}

export function DealFollowupsSection({ opportunityId, ownerId, stageName, title }: DealFollowupsSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" className="h-8 w-full gap-1.5" onClick={() => setOpen(true)}>
        <CalendarClock className="h-3.5 w-3.5" />
        Agendar follow-up
      </Button>
      <FollowupList opportunityId={opportunityId} stageName={stageName} />
      <FollowupDialog open={open} onOpenChange={setOpen} opportunityId={opportunityId} ownerId={ownerId} title={title} />
    </div>
  );
}
