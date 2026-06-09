// src/components/crm/copilot/TrackShaperDialog.tsx
// Sprint 6 — C4: Self-Shaping Track setup dashboard (Story A)
//
// Dark, minimal dialog:
//   1. Textarea (PT-BR paragraph) → "Gerar" → calls shapePreview
//   2. Preview: proposed Kanban stages (in order) + custom fields (key/label/type)
//   3. "Criar pipeline" → calls shapeApply → invalidates pipelines + toast + close

import { useState } from "react";
import { Loader2, Sparkles, Layers, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTrackShaper } from "@/hooks/useTrackShaper";

// ── Stage type colour hints ───────────────────────────────────────────────────

const STAGE_TYPE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  won: "default",
  lost: "destructive",
};

const STAGE_TYPE_LABEL: Record<string, string> = {
  open: "aberta",
  won: "ganha",
  lost: "perdida",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface TrackShaperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrackShaperDialog({
  open,
  onOpenChange,
}: TrackShaperDialogProps) {
  const [prompt, setPrompt] = useState("");
  const {
    blueprint,
    isPreviewing,
    previewError,
    generatePreview,
    isApplying,
    applyBlueprint,
    reset,
  } = useTrackShaper();

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPrompt("");
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    generatePreview(prompt.trim());
  };

  const handleCreate = async () => {
    const success = await applyBlueprint();
    if (success) {
      handleClose(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Criar pipeline com Copilot
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Descreva em português como funciona o seu processo de vendas. O
            Copilot vai propor as colunas do Kanban e os campos personalizados.
          </DialogDescription>
        </DialogHeader>

        {/* ── Prompt input ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Preciso capturar proprietários de imóveis na planta, descobrir o número de dormitórios e o valor do condomínio, agendar uma vistoria com prazo de 24h e depois enviar o contrato..."
            className="min-h-[120px] resize-none bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-violet-500"
            disabled={isPreviewing || isApplying}
          />

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isPreviewing || isApplying}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isPreviewing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando prévia…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar
              </>
            )}
          </Button>

          {previewError && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-md px-3 py-2">
              {previewError}
            </p>
          )}
        </div>

        {/* ── Blueprint preview ─────────────────────────────────────────── */}
        {blueprint && (
          <div className="space-y-4 border-t border-zinc-800 pt-4">
            {/* Pipeline name + description */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {blueprint.pipeline_name}
              </h3>
              {blueprint.description && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  {blueprint.description}
                </p>
              )}
            </div>

            {/* Stages */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Colunas do Kanban ({blueprint.stages.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {[...blueprint.stages]
                  .sort((a, b) => a.position - b.position)
                  .map((stage) => (
                    <div
                      key={stage.position}
                      className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-xs text-zinc-200 font-medium">
                        {stage.name}
                      </span>
                      <Badge
                        variant={
                          STAGE_TYPE_VARIANT[stage.stage_type] ?? "outline"
                        }
                        className="text-[9px] h-4 px-1"
                      >
                        {STAGE_TYPE_LABEL[stage.stage_type] ?? stage.stage_type}
                      </Badge>
                      {stage.max_idle_hours != null && (
                        <span className="text-[9px] text-zinc-500">
                          SLA {stage.max_idle_hours}h
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Custom fields */}
            {blueprint.custom_fields.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Campos personalizados ({blueprint.custom_fields.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[...blueprint.custom_fields]
                    .sort((a, b) => a.position - b.position)
                    .map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-200 font-medium truncate">
                            {field.label}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono truncate">
                            {field.key}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1 border-zinc-700 text-zinc-400 shrink-0"
                        >
                          {field.type}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {blueprint && (
          <DialogFooter className="border-t border-zinc-800 pt-4">
            <Button
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={isApplying}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isApplying}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando pipeline…
                </>
              ) : (
                "Criar pipeline"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
