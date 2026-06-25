import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { useAgentRules } from "@/hooks/useAgentRules";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { usePipelines } from "@/hooks/usePipelines";

import type {
  AgentAction,
  AgentActionType,
  AgentIntent,
  AgentMediaType,
  AgentRuleTrigger,
  AgentTriggerType,
  AgentTriggerWhen,
  CustomFieldSchema,
  StageType,
} from "@/types/pipelines";

// ─── Labels & meta ───────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<AgentTriggerType, string> = {
  intent_detected: "Intenção detectada",
  message_contains: "Mensagem contém",
  media_received: "Mídia recebida",
  stage_entered: "Entrou na etapa",
  idle_in_stage: "Ocioso na etapa",
  custom_field_set: "Campo preenchido",
};

const INTENT_LABELS: Record<AgentIntent, string> = {
  meeting_scheduled: "Reunião agendada",
  interested: "Interessado",
  disqualified: "Desqualificado",
  objection_price: "Objeção de preço",
  objection_timing: "Objeção de prazo",
};

const MEDIA_LABELS: Record<AgentMediaType, string> = {
  image: "Imagem",
  audio: "Áudio",
  document: "Documento",
  video: "Vídeo",
};

const ACTION_LABELS: Record<AgentActionType, string> = {
  move_stage: "Mover etapa",
  set_status: "Definir status",
  set_field: "Definir campo",
  set_contact_field: "Definir campo do contato",
  add_touchpoint: "Adicionar touchpoint",
  add_note: "Adicionar nota",
  create_task: "Criar tarefa",
  add_tag: "Adicionar tag",
  trigger_webhook: "Disparar webhook",
};

const STAGE_TYPE_LABELS: Record<StageType, string> = {
  open: "Aberta",
  won: "Ganha",
  lost: "Perdida",
};

// ─── Defaults ────────────────────────────────────────────────────────────

const defaultWhen = (type: AgentTriggerType): AgentTriggerWhen => {
  switch (type) {
    case "intent_detected":
      return { type, intent: "interested" };
    case "message_contains":
      return { type, pattern: "" };
    case "media_received":
      return { type, media_type: "image" };
    case "stage_entered":
      return { type, stage_id: "" };
    case "idle_in_stage":
      return { type, hours: 24 };
    case "custom_field_set":
      return { type, field_id: "" };
  }
};

const defaultAction = (action: AgentActionType): AgentAction => {
  switch (action) {
    case "move_stage":
      return { action, stage_type: "open" };
    case "set_status":
      return { action, status: "won" };
    case "set_field":
      return { action, field_id: "", value: "" };
    case "set_contact_field":
      return { action, key: "", value: "" };
    case "add_touchpoint":
      return { action, touchpoint_type: "note", content_template: "" };
    case "add_note":
      return { action, content_template: "" };
    case "create_task":
      return { action, title_template: "" };
    case "add_tag":
      return { action, tag: "" };
    case "trigger_webhook":
      return { action, url: "" };
  }
};

const newRule = (): AgentRuleTrigger => ({
  id: crypto.randomUUID(),
  name: "",
  when: { type: "intent_detected", intent: "interested" },
  do: [],
  active: true,
});

// ─── Sub-components ──────────────────────────────────────────────────────

/** Trigger param editor — contextual inputs based on trigger type. */
const TriggerEditor = ({
  when,
  onChange,
  stages,
  customFields,
}: {
  when: AgentTriggerWhen;
  onChange: (w: AgentTriggerWhen) => void;
  stages: { id: string; name: string }[];
  customFields: CustomFieldSchema[];
}) => {
  switch (when.type) {
    case "intent_detected":
      return (
        <Select
          value={when.intent}
          onValueChange={(v) =>
            onChange({ ...when, intent: v as AgentIntent })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INTENT_LABELS) as AgentIntent[]).map((k) => (
              <SelectItem key={k} value={k}>
                {INTENT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "message_contains":
      return (
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Texto ou regex…"
            value={when.pattern}
            onChange={(e) => onChange({ ...when, pattern: e.target.value })}
            className="flex-1"
          />
          <div className="flex items-center gap-1.5">
            <Switch
              id="regex-toggle"
              checked={!!when.is_regex}
              onCheckedChange={(v) => onChange({ ...when, is_regex: v })}
            />
            <Label htmlFor="regex-toggle" className="text-xs whitespace-nowrap">
              Regex
            </Label>
          </div>
        </div>
      );

    case "media_received":
      return (
        <Select
          value={when.media_type}
          onValueChange={(v) =>
            onChange({ ...when, media_type: v as AgentMediaType })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MEDIA_LABELS) as AgentMediaType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {MEDIA_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "stage_entered":
      return (
        <Select
          value={when.stage_id}
          onValueChange={(v) => onChange({ ...when, stage_id: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecionar etapa…" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "idle_in_stage":
      return (
        <div className="flex gap-2 items-center">
          <Select
            value={when.stage_id ?? "__any__"}
            onValueChange={(v) =>
              onChange({ ...when, stage_id: v === "__any__" ? undefined : v })
            }
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Qualquer etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Qualquer etapa</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={when.hours}
            onChange={(e) =>
              onChange({ ...when, hours: parseInt(e.target.value) || 1 })
            }
          />
          <span className="text-xs text-muted-foreground shrink-0">horas</span>
        </div>
      );

    case "custom_field_set":
      return (
        <Select
          value={when.field_id}
          onValueChange={(v) => onChange({ ...when, field_id: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecionar campo…" />
          </SelectTrigger>
          <SelectContent>
            {customFields
              .filter((f) => !f.is_deleted)
              .map((f) => (
                <SelectItem key={f.field_id} value={f.field_id}>
                  {f.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      );
  }
};

/** Single action row editor. */
const ActionEditor = ({
  action,
  onChange,
  onRemove,
  stages,
  customFields,
}: {
  action: AgentAction;
  onChange: (a: AgentAction) => void;
  onRemove: () => void;
  stages: { id: string; name: string }[];
  customFields: CustomFieldSchema[];
}) => {
  const renderParams = () => {
    switch (action.action) {
      case "move_stage":
        return (
          <div className="flex gap-2">
            <Select
              value={action.stage_type}
              onValueChange={(v) =>
                onChange({ ...action, stage_type: v as StageType })
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STAGE_TYPE_LABELS) as StageType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {STAGE_TYPE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Nome da etapa (hint)…"
              value={action.stage_name_hint ?? ""}
              onChange={(e) =>
                onChange({ ...action, stage_name_hint: e.target.value || undefined })
              }
              className="flex-1"
            />
          </div>
        );

      case "set_status":
        return (
          <Select
            value={action.status}
            onValueChange={(v) =>
              onChange({ ...action, status: v as "open" | "won" | "lost" })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Aberta</SelectItem>
              <SelectItem value="won">Ganha</SelectItem>
              <SelectItem value="lost">Perdida</SelectItem>
            </SelectContent>
          </Select>
        );

      case "set_field":
        return (
          <div className="flex gap-2">
            <Select
              value={action.field_id}
              onValueChange={(v) => onChange({ ...action, field_id: v })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Campo…" />
              </SelectTrigger>
              <SelectContent>
                {customFields
                  .filter((f) => !f.is_deleted)
                  .map((f) => (
                    <SelectItem key={f.field_id} value={f.field_id}>
                      {f.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Valor…"
              value={String(action.value ?? "")}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              className="flex-1"
            />
          </div>
        );

      case "set_contact_field":
        return (
          <div className="flex gap-2">
            <Input
              placeholder="Chave (ex: cargo)…"
              value={action.key}
              onChange={(e) => onChange({ ...action, key: e.target.value })}
              className="flex-1"
            />
            <Input
              placeholder="Valor…"
              value={String(action.value ?? "")}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              className="flex-1"
            />
          </div>
        );

      case "add_touchpoint":
        return (
          <div className="flex gap-2">
            <Input
              placeholder="Tipo (ex: meeting, call)…"
              value={action.touchpoint_type}
              onChange={(e) =>
                onChange({ ...action, touchpoint_type: e.target.value })
              }
              className="w-32"
            />
            <Input
              placeholder="Conteúdo (template)…"
              value={action.content_template}
              onChange={(e) =>
                onChange({ ...action, content_template: e.target.value })
              }
              className="flex-1"
            />
          </div>
        );

      case "add_note":
        return (
          <Input
            placeholder="Conteúdo da nota…"
            value={action.content_template}
            onChange={(e) =>
              onChange({ ...action, content_template: e.target.value })
            }
          />
        );

      case "create_task":
        return (
          <div className="flex gap-2">
            <Input
              placeholder="Título da tarefa…"
              value={action.title_template}
              onChange={(e) =>
                onChange({ ...action, title_template: e.target.value })
              }
              className="flex-1"
            />
            <Input
              type="number"
              min={1}
              placeholder="Prazo (h)"
              value={action.due_in_hours ?? ""}
              onChange={(e) =>
                onChange({
                  ...action,
                  due_in_hours: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                })
              }
              className="w-24"
            />
          </div>
        );

      case "add_tag":
        return (
          <Input
            placeholder="Nome da tag…"
            value={action.tag}
            onChange={(e) => onChange({ ...action, tag: e.target.value })}
          />
        );

      case "trigger_webhook":
        return (
          <Input
            placeholder="URL do webhook…"
            value={action.url}
            onChange={(e) => onChange({ ...action, url: e.target.value })}
          />
        );
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/50 p-2">
      <GripVertical className="h-4 w-4 mt-2.5 text-muted-foreground/40 shrink-0" />
      <div className="flex-1 space-y-2">
        <Select
          value={action.action}
          onValueChange={(v) => onChange(defaultAction(v as AgentActionType))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTION_LABELS) as AgentActionType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {ACTION_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderParams()}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

/** A single rule card — collapsible. */
const RuleCard = ({
  rule,
  onChange,
  onRemove,
  stages,
  customFields,
}: {
  rule: AgentRuleTrigger;
  onChange: (r: AgentRuleTrigger) => void;
  onRemove: () => void;
  stages: { id: string; name: string }[];
  customFields: CustomFieldSchema[];
}) => {
  const [open, setOpen] = useState(true);

  const updateAction = (idx: number, a: AgentAction) => {
    const next = [...rule.do];
    next[idx] = a;
    onChange({ ...rule, do: next });
  };

  const removeAction = (idx: number) => {
    onChange({ ...rule, do: rule.do.filter((_, i) => i !== idx) });
  };

  const addAction = () => {
    onChange({
      ...rule,
      do: [...rule.do, defaultAction("move_stage")],
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-2 p-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              {open ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          <Input
            placeholder="Nome da regra…"
            value={rule.name}
            onChange={(e) => onChange({ ...rule, name: e.target.value })}
            className="h-8 text-sm flex-1"
          />

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={rule.active}
              onCheckedChange={(v) => onChange({ ...rule, active: v })}
            />
            <Badge
              variant={rule.active ? "default" : "secondary"}
              className="text-[10px]"
            >
              {rule.active ? "Ativa" : "Inativa"}
            </Badge>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Body */}
        <CollapsibleContent>
          <div className="border-t border-border p-4 space-y-4">
            {/* Trigger */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="h-3 w-3" />
                Quando…
              </Label>
              <Select
                value={rule.when.type}
                onValueChange={(v) =>
                  onChange({
                    ...rule,
                    when: defaultWhen(v as AgentTriggerType),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(TRIGGER_LABELS) as AgentTriggerType[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TRIGGER_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TriggerEditor
                when={rule.when}
                onChange={(w) => onChange({ ...rule, when: w })}
                stages={stages}
                customFields={customFields}
              />
              {(rule.when.type === "stage_entered" ||
                rule.when.type === "idle_in_stage") && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  🔄 Esta regra é verificada automaticamente ao longo do tempo, sem depender de mensagens do contato.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Então…
              </Label>
              <div className="space-y-2">
                {rule.do.map((a, idx) => (
                  <ActionEditor
                    key={idx}
                    action={a}
                    onChange={(next) => updateAction(idx, next)}
                    onRemove={() => removeAction(idx)}
                    stages={stages}
                    customFields={customFields}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={addAction}
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar ação
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// ─── Main Panel ──────────────────────────────────────────────────────────

interface AgentRulesPanelProps {
  pipelineId: string;
  pipelineName?: string;
}

/**
 * Sprint 4 EPIC 5 — per-pipeline Agente CRM rules editor.
 *
 * Three sections:
 *   A) Behavior toggles (4 switches + cooldown slider)
 *   B) Rules list (trigger→action builder)
 *   C) Extraction hints (free-text textarea)
 *
 * All edits are local until the admin clicks "Salvar". A dirty-state badge
 * shows unsaved changes.
 */
export const AgentRulesPanel = ({
  pipelineId,
  pipelineName,
}: AgentRulesPanelProps) => {
  const { rules, isLoading, upsertRules } = useAgentRules(pipelineId);
  const { stages } = usePipelineStagesV2(pipelineId);
  const { pipelines } = usePipelines();

  const customFields = useMemo(() => {
    const p = pipelines.find((pp) => pp.id === pipelineId);
    return p?.custom_fields_schema ?? [];
  }, [pipelines, pipelineId]);

  // ── Local state (mirrors DB, dirty-tracked) ──
  const [autoCreate, setAutoCreate] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoExtract, setAutoExtract] = useState(true);
  const [cooldown, setCooldown] = useState(3);
  const [triggers, setTriggers] = useState<AgentRuleTrigger[]>([]);
  const [hints, setHints] = useState("");
  const [dirty, setDirty] = useState(false);

  // Seed local state from DB on load / refetch.
  useEffect(() => {
    if (!rules) {
      setAutoCreate(false);
      setAutoAdvance(true);
      setAutoExtract(true);
      setCooldown(3);
      setTriggers([]);
      setHints("");
    } else {
      setAutoCreate(rules.auto_create_opportunity);
      setAutoAdvance(rules.auto_advance_stages);
      setAutoExtract(rules.auto_extract_custom_fields);
      setCooldown(rules.cooldown_minutes);
      setTriggers(rules.triggers);
      setHints(rules.extraction_hints ?? "");
    }
    setDirty(false);
  }, [rules]);

  // Dirty tracker — wraps each setter.
  const mark = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
      (val: React.SetStateAction<T>) => {
        setter(val);
        setDirty(true);
      },
    [],
  );

  const handleSave = () => {
    upsertRules.mutate({
      auto_create_opportunity: autoCreate,
      auto_advance_stages: autoAdvance,
      auto_extract_custom_fields: autoExtract,
      cooldown_minutes: cooldown,
      triggers,
      extraction_hints: hints || null,
    });
  };

  const addRule = () => {
    setTriggers((prev) => [...prev, newRule()]);
    setDirty(true);
  };

  const updateRule = (idx: number, r: AgentRuleTrigger) => {
    setTriggers((prev) => prev.map((item, i) => (i === idx ? r : item)));
    setDirty(true);
  };

  const removeRule = (idx: number) => {
    setTriggers((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const stageList = useMemo(
    () => stages.map((s) => ({ id: s.id, name: s.name })),
    [stages],
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">
          Carregando regras…
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Agente CRM
              </h2>
              <p className="text-xs text-muted-foreground">
                Regras de automação{pipelineName ? ` · ${pipelineName}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">
                Alterações não salvas
              </Badge>
            )}
            <Button
              onClick={handleSave}
              disabled={!dirty || upsertRules.isPending}
              size="sm"
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {upsertRules.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Section A — Behavior Toggles */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Comportamento do Agente
          </h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Auto-criar oportunidade</p>
                <p className="text-xs text-muted-foreground">
                  Criar oportunidade se o contato não tiver uma aberta
                </p>
              </div>
              <Switch
                checked={autoCreate}
                onCheckedChange={mark(setAutoCreate)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Avançar etapas</p>
                <p className="text-xs text-muted-foreground">
                  Mover o lead de etapa automaticamente
                </p>
              </div>
              <Switch
                checked={autoAdvance}
                onCheckedChange={mark(setAutoAdvance)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Extrair campos</p>
                <p className="text-xs text-muted-foreground">
                  Preencher campos personalizados via IA
                </p>
              </div>
              <Switch
                checked={autoExtract}
                onCheckedChange={mark(setAutoExtract)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Cooldown</p>
                <span className="text-xs text-muted-foreground font-mono">
                  {cooldown} min
                </span>
              </div>
              <Slider
                value={[cooldown]}
                min={1}
                max={30}
                step={1}
                onValueChange={([v]) => {
                  setCooldown(v);
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </section>

        {/* Section B — Rules List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Regras ({triggers.length})
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRule}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova regra
            </Button>
          </div>

          {triggers.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma regra configurada. Clique em "Nova regra" para começar.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {triggers.map((rule, idx) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onChange={(r) => updateRule(idx, r)}
                onRemove={() => removeRule(idx)}
                stages={stageList}
                customFields={customFields}
              />
            ))}
          </div>
        </section>

        {/* Section C — Training */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Treinamento
          </h3>
          <p className="text-xs text-muted-foreground">
            Instruções adicionais para o agente sobre como interpretar e extrair informações dos contatos desta pipeline.
          </p>
          <Textarea
            placeholder="Ex: Extrair kWp das contas de luz. Capturar tipo de telhado quando mencionado. Se o lead mencionar concorrentes, adicionar tag 'competitive'."
            value={hints}
            onChange={(e) => {
              setHints(e.target.value);
              setDirty(true);
            }}
            rows={4}
            className="resize-none"
            maxLength={2000}
          />
          <p className="text-[11px] text-muted-foreground text-right">
            {hints.length} / 2000
          </p>
        </section>
      </div>
    </div>
  );
};
