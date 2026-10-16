import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { sampleEventPayload, type WebhookOrigin } from "@/lib/webhookCatalog";

/** Selo "Origem" — de onde o webhook é disparado (etapa, botão ou evento). */
export const WebhookOriginBadge = ({ origin }: { origin: WebhookOrigin }) => (
  <Badge variant={origin.kind === "event" ? "outline" : "secondary"} title="Origem">
    Origem: {origin.label}
  </Badge>
);

/** Payload de exemplo do evento: serve de referência para o mapeamento de campos do outro lado. */
export const WebhookSamplePayload = ({ triggerEvent }: { triggerEvent: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Payload de exemplo
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto mt-2 max-h-72">
          {JSON.stringify(sampleEventPayload(triggerEvent), null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
};
