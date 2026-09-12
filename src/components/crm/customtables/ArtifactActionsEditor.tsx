import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useArtifactActionsConfig } from "@/hooks/useArtifactActions";
import { actionDraftError, MAX_ACTIONS, type ArtifactActionDraft } from "@/lib/artifactActions";

interface ArtifactActionsEditorProps {
  tableId: string;
}

/**
 * Sprint 11 · Onda 4 · T44 — the automation buttons of an artifact table: a
 * label and the URL of the automation (the n8n webhook). Each record gets the
 * buttons; the payload and the answer follow contract v1
 * (Planning/Architecture/contrato_artefato_v1.md).
 */
export function ArtifactActionsEditor({ tableId }: ArtifactActionsEditorProps) {
  const [open, setOpen] = useState(false);
  const { actions, isLoading, save } = useArtifactActionsConfig(tableId, open);
  const [drafts, setDrafts] = useState<ArtifactActionDraft[]>([]);

  useEffect(() => {
    if (open) setDrafts(actions);
  }, [open, actions]);

  const errors = drafts.map(actionDraftError);
  const firstError = errors.find(Boolean) ?? null;
  const dirty = JSON.stringify(drafts) !== JSON.stringify(actions);

  const update = (i: number, patch: Partial<ArtifactActionDraft>) =>
    setDrafts((d) => d.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Zap className="mr-1 h-3 w-3" /> Ações
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem]" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">Botões de automação</h4>
            <p className="text-[11px] text-muted-foreground">
              Cada registro ganha os botões. O clique manda o registro, o negócio e o contato para a URL e espera o
              retorno (status, campos e arquivos).
            </p>
          </div>

          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {drafts.length === 0 && <p className="text-xs text-muted-foreground">Nenhum botão ainda.</p>}
              {drafts.map((a, i) => (
                <div key={a.id ?? `new-${i}`} className="space-y-1.5 rounded-md border border-border p-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={a.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      placeholder="Nome do botão (ex: Gerar proposta)"
                      className="h-7 text-xs"
                      maxLength={60}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setDrafts((d) => d.filter((_, j) => j !== i))}
                      aria-label={`Remover o botão ${a.label}`}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    value={a.url}
                    onChange={(e) => update(i, { url: e.target.value })}
                    placeholder="https://… (webhook da automação)"
                    className="h-7 font-mono text-[11px]"
                  />
                </div>
              ))}
            </div>
          )}

          {firstError && drafts.length > 0 && <p className="text-[11px] text-destructive">{firstError}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDrafts((d) => [...d, { label: "", url: "" }])}
              disabled={drafts.length >= MAX_ACTIONS}
            >
              <Plus className="mr-1 h-3 w-3" /> Botão
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => save.mutate(drafts)}
              disabled={!dirty || !!firstError || save.isPending}
            >
              {save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
