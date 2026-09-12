import { format } from "date-fns";
import { ClipboardList, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCreateFormLink, useRecordFormLink } from "@/hooks/usePublicForm";
import { formLinkState } from "@/lib/publicForm";

const when = (iso: string) => {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm");
  } catch {
    return iso;
  }
};

/**
 * Sprint 11 · Onda 4 · T45 — the record's public form link, in the drawer:
 * whether the client already answered, and a new link (copied at once — the
 * database keeps only its hash, so an old link cannot be shown again).
 */
export function RecordFormLink({ recordId }: { recordId: string }) {
  const link = useRecordFormLink(recordId, true);
  const create = useCreateFormLink();
  const state = formLinkState(link.data);

  const lastUrl = create.data && create.variables === recordId ? create.data : null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" /> Formulário do cliente
      </p>
      <p className="text-xs text-muted-foreground">
        {state === "none" && "Nenhum link enviado ainda."}
        {state === "open" && link.data && `Link enviado em ${when(link.data.created_at)} · vale até ${when(link.data.expires_at)}.`}
        {state === "submitted" && link.data?.submitted_at && `Respondido em ${when(link.data.submitted_at)}.`}
        {state === "expired" && "O último link venceu sem resposta."}
      </p>
      {lastUrl && !lastUrl.copied && (
        <p className="break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">{lastUrl.url}</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => create.mutate(recordId)}
        disabled={create.isPending}
      >
        {create.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
        {state === "none" ? "Gerar e copiar link" : "Gerar novo link (o anterior deixa de valer)"}
      </Button>
    </div>
  );
}
