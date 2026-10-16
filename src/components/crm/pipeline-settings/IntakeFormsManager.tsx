/**
 * SE-SUP1-7 (#6) — "Formulários": public forms that create a contact + a deal in
 * THIS pipeline (Formulário de Indicação and the like).
 *
 * Lives inside the pipeline editor because a form is pinned to a pipeline and a
 * stage, and its fields can land on that pipeline's custom fields — everything the
 * builder needs is already open here. The public link is /f/<token> (PublicForm).
 * The person who fills it never sees the destinations; the database validates and
 * applies them (_crm_intake_submit).
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useIntakeForms, type IntakeForm, type IntakeFormDraft } from "@/hooks/useIntakeForms";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import {
  INDICACAO_PRESET,
  INTAKE_FIELD_TYPES,
  INTAKE_FIELD_TYPE_LABELS,
  LEAD_TARGETS,
  intakeFormUrl,
  slugify,
  validateIntakeDefinition,
  type IntakeField,
  type IntakeFieldType,
  type IntakeTarget,
} from "@/lib/intakeForms";
import type { Pipeline } from "@/types/pipelines";

const NONE = "__none";

const emptyDraft = (pipelineId: string, stageId: string): IntakeFormDraft => ({
  slug: "",
  title: "",
  description: "",
  fields: [],
  pipeline_id: pipelineId,
  stage_id: stageId,
  responsible_id: null,
  origin_label: "Formulário",
  origin_category: null,
  is_active: false,
});

const nextKey = (fields: IntakeField[]) => {
  let n = fields.length + 1;
  while (fields.some((f) => f.key === `campo${n}`)) n += 1;
  return `campo${n}`;
};

export function IntakeFormsManager({ pipeline }: { pipeline: Pipeline }) {
  const { forms, isLoading, save, setActive } = useIntakeForms();
  const { stages } = usePipelineStagesV2(pipeline.id);
  const { members } = useMemberDirectory();
  const [draft, setDraft] = useState<IntakeFormDraft | null>(null);

  const mine = forms.filter((f) => f.pipeline_id === pipeline.id);
  const firstStage = stages[0]?.id ?? "";
  const customTargets = pipeline.custom_fields_schema
    .filter((f) => !f.is_deleted && ["text", "number", "date", "boolean", "select", "phone", "url"].includes(f.type))
    .map((f) => ({ value: `custom:${f.field_id}` as IntakeTarget, label: `Campo do negócio: ${f.label}` }));
  const targets = [...LEAD_TARGETS, ...customTargets];

  const copyLink = async (form: IntakeForm) => {
    try {
      await navigator.clipboard.writeText(intakeFormUrl(window.location.origin, form.token));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  const patchField = (i: number, patch: Partial<IntakeField>) =>
    setDraft((d) => (d ? { ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) } : d));

  const moveField = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const next = [...d.fields];
      const j = i + by;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, fields: next };
    });

  const applyPreset = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            slug: d.slug || INDICACAO_PRESET.id,
            title: INDICACAO_PRESET.title,
            description: INDICACAO_PRESET.description,
            origin_label: INDICACAO_PRESET.originLabel,
            origin_category: INDICACAO_PRESET.originCategory,
            fields: INDICACAO_PRESET.fields.map((f) => ({ ...f })),
          }
        : d,
    );

  const submit = async () => {
    if (!draft) return;
    const problems = [
      ...(draft.title.trim() ? [] : ["Dê um título ao formulário"]),
      ...(draft.stage_id ? [] : ["Escolha a etapa de destino"]),
      ...validateIntakeDefinition(draft.fields),
    ];
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    try {
      await save.mutateAsync({
        ...draft,
        title: draft.title.trim(),
        slug: draft.id ? draft.slug : slugify(draft.slug || draft.title),
        origin_label: draft.origin_label.trim() || "Formulário",
        fields: draft.fields.map((f) => ({ ...f, label: f.label.trim() })),
      });
      setDraft(null);
    } catch {
      // toast handled in the hook
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Links públicos que criam o contato e o negócio nesta pipeline. Ex.: Formulário de Indicação.
        </p>
        <Button size="sm" onClick={() => setDraft(emptyDraft(pipeline.id, firstStage))} disabled={!firstStage}>
          <Plus className="mr-1 h-4 w-4" /> Novo formulário
        </Button>
      </div>

      {isLoading ? null : mine.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhum formulário nesta pipeline.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {mine.map((form) => (
            <li key={form.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{form.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {form.fields.length} campos · origem: {form.origin_label} ·{" "}
                  {stages.find((s) => s.id === form.stage_id)?.name ?? "etapa removida"}
                </p>
              </div>
              <Badge variant={form.is_active ? "default" : "secondary"}>{form.is_active ? "No ar" : "Desligado"}</Badge>
              <Switch
                checked={form.is_active}
                onCheckedChange={(active) => setActive.mutate({ id: form.id, active })}
                aria-label="Ativar formulário"
              />
              <Button variant="outline" size="sm" onClick={() => void copyLink(form)}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar link
              </Button>
              <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setDraft({ ...form })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar formulário" : "Novo formulário"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              {!draft.id && draft.fields.length === 0 && (
                <Button variant="outline" size="sm" onClick={applyPreset}>
                  <WandSparkles className="mr-1 h-4 w-4" /> Começar do modelo “{INDICACAO_PRESET.name}”
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Título *</Label>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div>
                  <Label>Origem gravada no contato</Label>
                  <Input value={draft.origin_label} onChange={(e) => setDraft({ ...draft, origin_label: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Texto de apresentação</Label>
                  <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <div>
                  <Label>Categoria de origem</Label>
                  <Select value={draft.origin_category ?? NONE} onValueChange={(v) => setDraft({ ...draft, origin_category: v === NONE ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem categoria</SelectItem>
                      {ORIGIN_CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Etapa de destino do negócio *</Label>
                  <Select value={draft.stage_id} onValueChange={(v) => setDraft({ ...draft, stage_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Select value={draft.responsible_id ?? NONE} onValueChange={(v) => setDraft({ ...draft, responsible_id: v === NONE ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem responsável</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  <Label>Formulário no ar</Label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Campos (na ordem em que aparecem)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        fields: [...draft.fields, { key: nextKey(draft.fields), label: "", type: "text", required: false, target: "lead.observations" }],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" /> Campo
                  </Button>
                </div>
                {draft.fields.map((f, i) => (
                  <div key={i} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1.4fr_1fr_1.4fr_auto]">
                    <Input placeholder="Pergunta" value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
                    <Select value={f.type} onValueChange={(v) => patchField(i, { type: v as IntakeFieldType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INTAKE_FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{INTAKE_FIELD_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={f.target} onValueChange={(v) => patchField(i, { target: v as IntakeTarget })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {targets.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-1 text-xs">
                        <Switch checked={f.required} onCheckedChange={(v) => patchField(i, { required: v })} /> Obrig.
                      </label>
                      <Button variant="ghost" size="icon" aria-label="Subir" onClick={() => moveField(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Descer" onClick={() => moveField(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover campo"
                        onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {f.type === "select" && (
                      <Input
                        className="sm:col-span-4"
                        placeholder="Opções separadas por vírgula"
                        value={(f.options ?? []).join(", ")}
                        onChange={(e) => patchField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
