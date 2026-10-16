/**
 * SE-SUP1-8 (#17) — "Distribuição": a roleta deste pipeline.
 *
 * O gestor escolhe o formato (rodízio, por peso ou por regra), quem participa,
 * o limite de negócios abertos por vendedor e se ausentes são pulados. A decisão
 * acontece no banco, no INSERT do negócio (crm_assign_next) — vale para webhook,
 * formulário, chat e importação sem nenhuma tela saber disso. Esta tela só
 * configura e mostra as últimas decisões com o motivo.
 *
 * Negócio cujo contato já tem responsável fica com ele: a roleta é para quem
 * chega sem dono.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { usePipelineDistribution } from "@/hooks/usePipelineDistribution";
import {
  DEFAULT_DISTRIBUTION,
  MODE_LABEL,
  RULE_FIELDS_HINT,
  ruleFieldOptions,
  validateDistribution,
  type DistributionConfig,
  type DistributionMode,
  type DistributionRule,
} from "@/lib/distribution";
import { cn } from "@/lib/utils";
import type { Pipeline } from "@/types/pipelines";

const STATUS_LABEL = { assigned: "atribuído", no_candidate: "sem candidato", error: "erro" } as const;

export function DistributionEditor({ pipeline }: { pipeline: Pipeline }) {
  const { members, nameOf } = useMemberDirectory();
  const { config, runs, save } = usePipelineDistribution(pipeline.id);
  const [draft, setDraft] = useState<DistributionConfig>(DEFAULT_DISTRIBUTION);

  // O rascunho recomeça do banco quando a configuração chega (ou é salva).
  useEffect(() => {
    if (config.data) setDraft(config.data);
  }, [config.data]);

  const fieldOptions = useMemo(() => ruleFieldOptions(pipeline.custom_fields_schema), [pipeline.custom_fields_schema]);
  const errors = validateDistribution(draft);
  const inRoulette = new Set(draft.members.map((m) => m.user_id));
  const set = (patch: Partial<DistributionConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleMember = (id: string, on: boolean) =>
    set({
      members: on
        ? [...draft.members, { user_id: id, weight: 1, away: false }]
        : draft.members.filter((m) => m.user_id !== id),
      // Quem sai da roleta sai também dos grupos das regras.
      rules: on ? draft.rules : draft.rules.map((r) => ({ ...r, user_ids: r.user_ids.filter((u) => u !== id) })),
    });

  const patchMember = (id: string, patch: { weight?: number; away?: boolean }) =>
    set({ members: draft.members.map((m) => (m.user_id === id ? { ...m, ...patch } : m)) });

  const patchRule = (i: number, patch: Partial<DistributionRule>) =>
    set({ rules: draft.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const moveRule = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= draft.rules.length) return;
    const next = [...draft.rules];
    [next[i], next[j]] = [next[j], next[i]];
    set({ rules: next });
  };

  if (config.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="dist-active" checked={draft.active} onCheckedChange={(v) => set({ active: v })} />
          <Label htmlFor="dist-active">Roleta ativa neste pipeline</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Formato</Label>
          <Select value={draft.mode} onValueChange={(v) => set({ mode: v as DistributionMode })}>
            <SelectTrigger className="h-8 w-[10rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABEL) as DistributionMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Vale para todo negócio que nasce sem responsável neste pipeline — webhook, formulário, chat e importação. Se o
        contato já tem responsável, o negócio fica com ele.
        {draft.mode === "round_robin" && " Rodízio: um para cada, na ordem da lista."}
        {draft.mode === "weighted" && " Por peso: peso 2 recebe o dobro de peso 1."}
        {draft.mode === "by_rule" && " Por regra: a primeira regra que casar escolhe o grupo; nenhuma casou, todos da roleta."}
      </p>

      {/* Membros */}
      <section className="space-y-2">
        <h4 className="text-xs font-medium">Quem participa</h4>
        <div className="divide-y divide-border rounded-md border border-border">
          {members.map((m) => {
            const member = draft.members.find((x) => x.user_id === m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <Checkbox
                  id={`dist-m-${m.id}`}
                  checked={!!member}
                  onCheckedChange={(v) => toggleMember(m.id, v === true)}
                />
                <Label htmlFor={`dist-m-${m.id}`} className="flex-1 truncate font-normal">
                  {m.name}
                </Label>
                {member && draft.mode === "weighted" && (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Peso</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="h-7 w-16 text-xs"
                      value={member.weight}
                      onChange={(e) => patchMember(m.id, { weight: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
                    />
                  </div>
                )}
                {member && (
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id={`dist-away-${m.id}`}
                      checked={member.away}
                      onCheckedChange={(v) => patchMember(m.id, { away: v })}
                    />
                    <Label htmlFor={`dist-away-${m.id}`} className="text-xs text-muted-foreground">
                      Ausente
                    </Label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Limite de negócios abertos por vendedor</Label>
          <Input
            type="number"
            min={1}
            placeholder="Sem limite"
            className="h-8 text-xs"
            value={draft.max_open_per_seller ?? ""}
            onChange={(e) => set({ max_open_per_seller: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground">Quem chegou ao limite neste pipeline é pulado.</p>
        </div>
        <div className="flex items-start gap-2 pt-5">
          <Switch id="dist-skip" checked={draft.skip_away} onCheckedChange={(v) => set({ skip_away: v })} />
          <div>
            <Label htmlFor="dist-skip" className="text-xs">Pular ausentes</Label>
            <p className="text-[11px] text-muted-foreground">Quem está marcado como ausente não recebe.</p>
          </div>
        </div>
      </div>

      {/* Regras */}
      {draft.mode === "by_rule" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium">Regras (avaliadas em ordem)</h4>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => set({ rules: [...draft.rules, { field: "origem", value: "", user_ids: [] }] })}
            >
              <Plus className="mr-1 h-3 w-3" /> Adicionar regra
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{RULE_FIELDS_HINT}</p>
          {draft.rules.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma regra. Ex.: se origem = Indicação → Ana e Bruno.</p>
          )}
          {draft.rules.map((r, i) => (
            <div key={i} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">Regra {i + 1}</Badge>
                <span className="text-xs text-muted-foreground">se</span>
                <Select value={r.field} onValueChange={(v) => patchRule(i, { field: v })}>
                  <SelectTrigger className="h-7 w-[11rem] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldOptions.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                    {/* Regra antiga com campo que não serve mais: aparece para ser trocada. */}
                    {!fieldOptions.some((f) => f.value === r.field) && (
                      <SelectItem value={r.field} disabled>
                        {r.field} (não disponível)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">=</span>
                <Input
                  className="h-7 w-[10rem] text-xs"
                  placeholder="Valor (ex.: Indicação)"
                  value={r.value}
                  onChange={(e) => patchRule(i, { value: e.target.value })}
                />
                <div className="ml-auto flex items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveRule(i, -1)} aria-label="Subir regra">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveRule(i, 1)} aria-label="Descer regra">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => set({ rules: draft.rules.filter((_, j) => j !== i) })}
                    aria-label="Remover regra"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">→ recebe:</span>
                {draft.members.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">marque quem participa acima</span>
                )}
                {draft.members.map((m) => {
                  const on = r.user_ids.includes(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() =>
                        patchRule(i, {
                          user_ids: on ? r.user_ids.filter((u) => u !== m.user_id) : [...r.user_ids, m.user_id],
                        })
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {nameOf(m.user_id) ?? "Usuário removido"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Padrão (nenhuma regra casou, ou o grupo está todo ausente/no limite): rodízio entre todos da roleta.
          </p>
        </section>
      )}

      {errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate(draft)} disabled={errors.length > 0 || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Salvar distribuição
        </Button>
      </div>

      {/* Últimas decisões */}
      <section className="space-y-1.5 border-t border-border pt-3">
        <h4 className="text-xs font-medium">Últimas decisões</h4>
        {(runs.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum negócio distribuído ainda.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {(runs.data ?? []).map((run) => (
              <li key={run.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular-nums text-muted-foreground">
                  {new Date(run.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="font-medium">{run.assigned_to ? nameOf(run.assigned_to) ?? "Usuário removido" : "—"}</span>
                <span className="text-muted-foreground">{run.reason}</span>
                {run.status !== "assigned" && (
                  <Badge variant={run.status === "error" ? "destructive" : "secondary"} className="px-1.5 py-0 text-[10px]">
                    {STATUS_LABEL[run.status]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
