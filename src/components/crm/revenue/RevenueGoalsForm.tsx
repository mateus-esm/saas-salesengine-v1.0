import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Target, Users, Settings, BarChart3, TrendingUp, Clock } from "lucide-react";
import { OwnerGoal } from "@/types/pipelines";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { useAuth } from "@/contexts/AuthContext";
import { periodBounds } from "@/hooks/useForecast";
import { formatBRL } from "@/lib/scoreboard";
import {
  buildRevenuePlan,
  formatInt,
  formatRate,
  type PlanStageRow,
} from "@/lib/revenuePlan";
import type { FunnelOverview } from "@/types/dashboard";

interface RevenueGoalsFormProps {
  pipelineId: string;
}

interface RevenueGoalsDraft {
  goalDeals: string;
  goalRevenue: string;
  period: string;
  ownerGoals: OwnerGoal[];
  /** SE-FIX-002 — meta de passagem por etapa, em % (0–100), por stage_id. */
  passGoals: Record<string, string>;
  /** SE-FIX-002 — lead time alvo do funil inteiro, em dias. */
  targetLeadTimeDays: string;
}

const EMPTY_DRAFT: RevenueGoalsDraft = {
  goalDeals: "",
  goalRevenue: "",
  period: "month",
  ownerGoals: [],
  passGoals: {},
  targetLeadTimeDays: "",
};

// SE-FIX-002 — o shape do rascunho mudou (0–1 → % e lead time alvo). A chave
// ganhou versão para um rascunho antigo não reaparecer como "0,5%".
const draftKeyFor = (pipelineId: string) => `revenue_goals_v2_${pipelineId}`;

/**
 * Normaliza o que o usuário digitou no campo de meta de passagem.
 *
 * `min`/`max` no `<Input>` são só atributos HTML: não impedem digitar 150 nem
 * -5. Sem normalizar, o campo mostrava 150 enquanto a conta usava 100, e a linha
 * do "Sem taxa" chamava de "sem meta" uma etapa com meta digitada.
 *
 * Vazio e valores não numéricos (o "-" de um "-5" em construção, por exemplo)
 * viram string vazia, que o memo de `overrides` simplesmente ignora — a etapa
 * cai no histórico, que é o que o placeholder promete.
 */
function normalizePct(raw: string): string {
  if (raw === "") return "";
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return "";
  return String(Math.max(0, Math.min(100, n)));
}

/** Os marcos do funil, como o banco os nomeia (20260912000800:47-52). */
const MILESTONE_LABEL: Record<string, string> = {
  qualified: "Qualificado",
  proposal_sent: "Proposta enviada",
  meeting_scheduled: "Reunião agendada",
  meeting_done: "Reunião feita",
  no_show: "Não compareceu",
  contract_sent: "Contrato enviado",
  contract_signed: "Contrato assinado",
};

export function RevenueGoalsForm({ pipelineId }: RevenueGoalsFormProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const draftKey = draftKeyFor(pipelineId);

  const { value: state, setValue: setState, clearPersisted, hasDraft } =
    useDraftAutosave<RevenueGoalsDraft>(draftKey, EMPTY_DRAFT);

  const { goalDeals, goalRevenue, period, ownerGoals, passGoals, targetLeadTimeDays } = state;

  // Load existing config
  const { data: config } = useQuery({
    queryKey: ["revenue_config", pipelineId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("pipelines")
        .select("revenue_config")
        .eq("id", pipelineId)
        .single();
      return (data?.revenue_config ?? {}) as Record<string, any>;
    },
    enabled: !!pipelineId,
  });

  // Seed form state from DB config — only when no draft exists (so unsaved
  // input survives navigation). Runs once on first load.
  useEffect(() => {
    if (config && !hasDraft && Object.keys(config).length > 0) {
      // O banco guarda a taxa em 0–1; a tela digita em %. Converter aqui deixa o
      // usuário ver "60" e não "0,6" — era o principal motivo da taxa parecer
      // não intuitiva.
      const pct: Record<string, string> = {};
      if (config.conversion_overrides) {
        for (const [k, v] of Object.entries(config.conversion_overrides)) {
          const n = Number(v);
          if (Number.isFinite(n)) pct[k] = String(Math.round(n * 10000) / 100);
        }
      }
      setState({
        goalDeals: String(config.goal_deals ?? ""),
        goalRevenue: String(config.goal_revenue ?? ""),
        period: config.period ?? "month",
        ownerGoals: config.owner_goals ?? [],
        passGoals: pct,
        targetLeadTimeDays:
          config.target_lead_time_days != null ? String(config.target_lead_time_days) : "",
      });
    }
  }, [config, hasDraft, setState]);

  const equipeId = profile?.equipe_id;

  // Team members
  // Sprint 11: profiles has no `name` column (it is nome_completo) and its RLS
  // only shows the user's own row, so this list was always empty and per-owner
  // goals could not be set. crm_team_members() returns the whole team.
  const { data: members = [] } = useQuery({
    queryKey: ["team_members_for_goals", equipeId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb.rpc("crm_team_members");
      if (error) throw error;
      return ((data ?? []) as { id: string; nome_completo: string | null }[]).map((m) => ({
        id: m.id,
        name: m.nome_completo,
      }));
    },
    enabled: !!equipeId,
  });

  // SE-FIX-002 — o plano por etapa: tipo, marco, SLA declarado, taxa histórica e
  // tempo médio real de permanência (fn_stage_conversion_plan).
  const { data: planRows = [] } = useQuery({
    queryKey: ["stage_conversion_plan", pipelineId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb.rpc("fn_stage_conversion_plan", {
        p_pipeline_id: pipelineId,
      });
      if (error) throw error;
      return (data ?? []) as PlanStageRow[];
    },
    enabled: !!pipelineId,
  });

  // SE-FIX-002 — o realizado do período. Reuniões e fechamentos JÁ existem no
  // banco: funnel_events alimenta o get_funnel_overview do Sprint 9, o mesmo que
  // o dashboard usa. Nada de tabela nova para isso.
  const bounds = periodBounds(period === "quarter" ? "quarter" : "month");
  const { data: realized } = useQuery({
    queryKey: [
      "revenue_goals_realized",
      pipelineId,
      bounds.start.toISOString(),
      bounds.end.toISOString(),
    ],
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb.rpc("get_funnel_overview", {
        p_from: bounds.start.toISOString(),
        p_to: bounds.end.toISOString(),
        p_pipeline_ids: [pipelineId],
      });
      if (error) throw error;
      return data as FunnelOverview;
    },
    enabled: !!pipelineId,
  });

  const memberName = (id: string): string =>
    members.find((m) => m.id === id)?.name ?? id.slice(0, 8);

  const updateField = (field: keyof RevenueGoalsDraft, value: any) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const goalDealsNum = parseInt(goalDeals) || 0;
  const goalRevenueNum = parseFloat(goalRevenue) || 0;
  const targetLeadTimeNum = parseFloat(targetLeadTimeDays) || 0;

  // As metas digitadas em % viram 0–1 para a aritmética da cadeia. O clamp aqui
  // (e não só na leitura) garante que o que vai para o banco também respeita a
  // faixa 0–1 que o campo promete — um "150" digitado é salvo como 1.
  const overrides = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [stageId, raw] of Object.entries(passGoals)) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) out[stageId] = Math.max(0, Math.min(1, n / 100));
    }
    return out;
  }, [passGoals]);

  const plan = useMemo(
    () =>
      buildRevenuePlan({
        rows: planRows,
        goalDeals: goalDealsNum,
        overrides,
        targetLeadTimeDays: targetLeadTimeNum > 0 ? targetLeadTimeNum : null,
      }),
    [planRows, goalDealsNum, overrides, targetLeadTimeNum],
  );

  const totalOwnerDeals = ownerGoals.reduce((s, g) => s + (g.target_deals || 0), 0);
  const totalOwnerRevenue = ownerGoals.reduce((s, g) => s + (g.target_revenue || 0), 0);
  const ownerDealsMatch = totalOwnerDeals === 0 || totalOwnerDeals === goalDealsNum;
  const ownerRevenueMatch = totalOwnerRevenue === 0 || totalOwnerRevenue === goalRevenueNum;

  // "Reunião feita" sem etapa mapeada: o banco não tem o que contar. Dizer isso
  // é diferente de mostrar zero reuniões, que parece fracasso do time.
  const meetingUnmapped = plan.stages.length > 0 && !plan.meeting_stage;

  const handleSave = async () => {
    const sb = supabase as any;
    const existing = config ?? {};
    const conversion_overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (Number.isFinite(v)) conversion_overrides[k] = v;
    }
    const updated = {
      ...existing,
      goal_deals: goalDealsNum,
      goal_revenue: goalRevenueNum,
      period,
      owner_goals: ownerGoals,
      conversion_overrides:
        Object.keys(conversion_overrides).length > 0 ? conversion_overrides : undefined,
      target_lead_time_days: targetLeadTimeNum > 0 ? targetLeadTimeNum : undefined,
    };
    await sb
      .from("pipelines")
      .update({ revenue_config: updated })
      .eq("id", pipelineId);
    toast.success("Metas salvas");
    clearPersisted(); // Clear persisted draft; keep on-screen values
    queryClient.invalidateQueries({ queryKey: ["forecast", pipelineId] });
  };

  return (
    <div className="space-y-6">
      {/* Step 1 — Headline target */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Meta Principal</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="goal-revenue" className="text-xs text-muted-foreground font-medium">
                Faturamento alvo (R$)
              </Label>
              <Input
                id="goal-revenue"
                type="number"
                value={goalRevenue}
                onChange={(e) => updateField("goalRevenue", e.target.value)}
                placeholder="0,00"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Receita total esperada no período
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-deals" className="text-xs text-muted-foreground font-medium">
                Negócios fechados alvo
              </Label>
              <Input
                id="goal-deals"
                type="number"
                value={goalDeals}
                onChange={(e) => updateField("goalDeals", e.target.value)}
                placeholder="Ex.: 20"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Quantas vendas precisam sair no período — é o fim da cadeia do funil
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                Período de apuração
              </Label>
              <Select value={period} onValueChange={(val) => updateField("period", val)}>
                <SelectTrigger className="h-9" aria-label="Período de apuração">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mensal</SelectItem>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground/60">
                Vale para a meta e para o realizado mostrado abaixo
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Owner split */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Divisão por Vendedor</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Quanto da meta principal cada vendedor carrega. Os dois campos são{" "}
            <strong>negócios fechados</strong> e <strong>faturamento</strong> — a soma
            não precisa bater com a meta principal, mas deveria.
          </p>
          {!ownerDealsMatch && totalOwnerDeals > 0 && (
            <p className="text-[11px] text-amber-500">
              ⚠ A soma dos negócios por vendedor ({totalOwnerDeals}) não bate com a meta principal ({goalDealsNum})
            </p>
          )}
          {!ownerRevenueMatch && totalOwnerRevenue > 0 && (
            <p className="text-[11px] text-amber-500">
              ⚠ A soma do faturamento por vendedor não bate com a meta principal
            </p>
          )}
          {ownerGoals.length > 0 && (
            <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="flex-1 min-w-0">Vendedor</span>
              <span className="w-20 text-center">Negócios</span>
              <span className="w-24 text-center">Faturamento (R$)</span>
              <span className="w-7 shrink-0" aria-hidden="true" />
            </div>
          )}
          <div className="space-y-2">
            {ownerGoals.map((og, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select
                  value={og.owner_id || undefined}
                  onValueChange={(val) => {
                    const updated = [...ownerGoals];
                    updated[idx] = { ...updated[idx], owner_id: val };
                    updateField("ownerGoals", updated);
                  }}
                >
                  <SelectTrigger
                    className="h-8 text-xs flex-1 min-w-0"
                    aria-label={`Vendedor da linha ${idx + 1}`}
                  >
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem
                        key={m.id}
                        value={m.id}
                        disabled={ownerGoals.some(
                          (g, i) => i !== idx && g.owner_id === m.id,
                        )}
                      >
                        {m.name ?? m.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="w-20 shrink-0">
                  <Label htmlFor={`owner-deals-${idx}`} className="sr-only">
                    Negócios fechados alvo do vendedor {memberName(og.owner_id || "")}
                  </Label>
                  <Input
                    id={`owner-deals-${idx}`}
                    type="number"
                    value={og.target_deals}
                    onChange={(e) => {
                      const updated = [...ownerGoals];
                      updated[idx] = { ...updated[idx], target_deals: parseInt(e.target.value) || 0 };
                      updateField("ownerGoals", updated);
                    }}
                    placeholder="Ex.: 5"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="w-24 shrink-0">
                  <Label htmlFor={`owner-revenue-${idx}`} className="sr-only">
                    Faturamento alvo do vendedor {memberName(og.owner_id || "")}
                  </Label>
                  <Input
                    id={`owner-revenue-${idx}`}
                    type="number"
                    value={og.target_revenue}
                    onChange={(e) => {
                      const updated = [...ownerGoals];
                      updated[idx] = { ...updated[idx], target_revenue: parseFloat(e.target.value) || 0 };
                      updateField("ownerGoals", updated);
                    }}
                    placeholder="Ex.: 50000"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={`Remover vendedor da linha ${idx + 1}`}
                  onClick={() => updateField("ownerGoals", ownerGoals.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs w-full"
            onClick={() => updateField("ownerGoals", [...ownerGoals, { owner_id: "", target_deals: 0, target_revenue: 0 }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Adicionar vendedor
          </Button>
          {ownerGoals.length > 0 && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              <span className="font-medium">Total distribuído:</span>{" "}
              {totalOwnerDeals} negócios / {formatBRL(totalOwnerRevenue)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3 — Metas de passagem por etapa (SE-FIX-002) */}
      {plan.stages.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Metas de passagem por etapa</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada etapa declara <strong>quantos leads seguem para a próxima</strong>. O
              sistema calcula para trás quantas entradas o topo do funil precisa — você não
              digita esse número. Em branco, a etapa usa a taxa que o histórico mostra.
            </p>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="flex-1 min-w-0">Etapa</span>
              <span className="w-24 text-center">Histórico</span>
              <span className="w-24 text-center">Meta de passagem (%)</span>
              <span className="w-12 shrink-0" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              {plan.stages.map((pass) => {
                const raw = passGoals[pass.stage.stage_id] ?? "";
                const milestone = pass.stage.funnel_event
                  ? MILESTONE_LABEL[pass.stage.funnel_event] ?? pass.stage.funnel_event
                  : null;
                return (
                  <div key={pass.stage.stage_id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-foreground truncate block">
                        {pass.stage.stage_name}
                      </span>
                      {milestone && (
                        <span className="text-[10px] text-muted-foreground/60">
                          Marco: {milestone}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-24 text-right">
                      {pass.stage.historical_rate === null
                        ? "sem histórico"
                        : formatRate(pass.stage.historical_rate)}
                    </span>
                    <div className="w-24 shrink-0">
                      <Label htmlFor={`pass-${pass.stage.stage_id}`} className="sr-only">
                        Meta de passagem para a próxima etapa, em % ({pass.stage.stage_name})
                      </Label>
                      <Input
                        id={`pass-${pass.stage.stage_id}`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={raw}
                        onChange={(e) =>
                          updateField("passGoals", {
                            ...passGoals,
                            [pass.stage.stage_id]: normalizePct(e.target.value),
                          })
                        }
                        placeholder={
                          pass.stage.historical_rate === null
                            ? "Ex.: 50"
                            : String(Math.round(pass.stage.historical_rate * 100))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <span className="w-12 shrink-0 text-[10px] text-amber-500">
                      {pass.manual ? "manual" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            {plan.skipped.length > 0 && (
              <p className="text-[10px] text-muted-foreground/60">
                Fora da cadeia de passagem (etapas terminais ou de reciclo):{" "}
                {plan.skipped.map((s) => s.stage_name).join(", ")}.
              </p>
            )}
            <div className="border-t pt-3 space-y-1.5">
              <Label
                htmlFor="target-lead-time"
                className="text-xs text-muted-foreground font-medium"
              >
                Lead time alvo do funil (dias)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="target-lead-time"
                  type="number"
                  min={1}
                  value={targetLeadTimeDays}
                  onChange={(e) => updateField("targetLeadTimeDays", e.target.value)}
                  placeholder="Ex.: 30"
                  className="h-8 text-xs w-28"
                />
                <span className="text-[11px] text-muted-foreground">
                  do lead que entra ao negócio fechado — o sistema divide por igual entre
                  as etapas para dar o orçamento de dias de cada uma
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — A cadeia derivada (SE-FIX-002) */}
      {plan.stages.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-semibold text-primary">A cadeia do funil</h4>
            </div>

            {plan.required_inbound === null ? (
              <p className="text-xs text-muted-foreground">
                Defina a meta de negócios fechados e ao menos uma taxa de passagem para o
                sistema derivar as entradas.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-semibold text-primary">
                    {formatInt(plan.required_inbound)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    entradas de leads necessárias no topo do funil
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Conversão do funil inteiro: {formatRate(plan.cumulative_rate)} — para{" "}
                  {formatInt(goalDealsNum)} negócio{goalDealsNum === 1 ? "" : "s"} fechado
                  {goalDealsNum === 1 ? "" : "s"} no período.
                </p>

                <div className="space-y-1.5 border-t border-primary/20 pt-3">
                  {plan.stages.map((pass, idx) => {
                    const nextIn =
                      idx + 1 < plan.stages.length
                        ? plan.stages[idx + 1].required_entries
                        : goalDealsNum;
                    return (
                      <div key={pass.stage.stage_id} className="text-[11px] leading-tight">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-medium">{pass.stage.stage_name}</span>
                          <span className="text-muted-foreground">
                            entram {formatInt(pass.required_entries)}
                          </span>
                          <span className="text-muted-foreground/60">
                            · passagem {pass.usable ? formatRate(pass.rate) : "—"}
                          </span>
                          <span className="text-muted-foreground">
                            → seguem {formatInt(nextIn)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pl-5 text-[10px] text-muted-foreground/70">
                          <Clock className="h-2.5 w-2.5" />
                          {pass.stage.max_idle_hours != null ? (
                            <span>SLA declarado: {pass.stage.max_idle_hours} h</span>
                          ) : (
                            <span>SLA declarado: sem SLA</span>
                          )}
                          <span>
                            · tempo médio real:{" "}
                            {pass.stage.avg_days_in_stage == null
                              ? "sem histórico"
                              : `${pass.stage.avg_days_in_stage} dias`}
                          </span>
                          {plan.stage_budget_days !== null && (
                            <span>· orçamento do lead time: {plan.stage_budget_days} dias</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-1 text-[11px] font-medium">
                    <Target className="h-3 w-3 text-primary shrink-0" />
                    Fechamentos (meta): {formatInt(goalDealsNum)}
                    {goalRevenueNum > 0 && (
                      <span className="text-muted-foreground font-normal">
                        · {formatBRL(goalRevenueNum)} no período
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}

            {plan.stages_without_rate.length > 0 && (
              <p className="text-[10px] text-amber-500">
                ⚠ Sem taxa utilizável (histórico ausente ou meta 0%):{" "}
                {plan.stages_without_rate.join(", ")} — o cálculo tratou{" "}
                {plan.stages_without_rate.length === 1 ? "esta etapa" : "estas etapas"} como
                passagem neutra, e por isso {plan.stages_without_rate.length === 1 ? "ela" : "elas"}{" "}
                fic{plan.stages_without_rate.length === 1 ? "ou" : "aram"} fora da conversão do
                funil.
              </p>
            )}

            {plan.observed_lead_time_days !== null && (
              <p className="text-[11px] text-muted-foreground">
                Lead time observado (soma do tempo médio real por etapa):{" "}
                <strong>{plan.observed_lead_time_days} dias</strong>
                {targetLeadTimeNum > 0 && (
                  <>
                    {" "}
                    — alvo declarado: {targetLeadTimeNum} dias
                    {plan.observed_lead_time_days > targetLeadTimeNum
                      ? " (acima do alvo)"
                      : " (dentro do alvo)"}
                  </>
                )}
              </p>
            )}

            {plan.required_meetings !== null && (
              <p className="text-[11px] text-muted-foreground">
                Reuniões realizadas necessárias (etapa marcada como "Reunião feita"):{" "}
                <strong>{formatInt(plan.required_meetings)}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 5 — Realizado no período (SE-FIX-002) */}
      {realized && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Realizado no período</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Contado dos eventos do funil (<code>funnel_events</code>) pelo mesmo RPC do
              dashboard, para o Placar e esta tela não divergirem.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Leads novos</div>
                <div className="font-semibold">{formatInt(realized.new_leads)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Reuniões agendadas</div>
                <div className="font-semibold">{formatInt(realized.meetings_scheduled)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Reuniões realizadas</div>
                <div className="font-semibold">{formatInt(realized.meetings_done)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Não compareceu</div>
                <div className="font-semibold">{formatInt(realized.no_shows)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Negócios fechados</div>
                <div className="font-semibold">
                  {formatInt(realized.deals_won)}
                  {goalDealsNum > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      / meta {formatInt(goalDealsNum)}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Taxa de comparecimento</div>
                <div className="font-semibold">
                  {typeof realized.show_rate === "number" ? `${realized.show_rate}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Ciclo médio (ganhos)</div>
                <div className="font-semibold">
                  {typeof realized.avg_cycle_days === "number"
                    ? `${realized.avg_cycle_days} dias`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Taxa de vitória</div>
                <div className="font-semibold">
                  {typeof realized.win_rate === "number" ? `${realized.win_rate}%` : "—"}
                </div>
              </div>
            </div>
            {meetingUnmapped && (
              <p className="text-[10px] text-amber-500">
                ⚠ Nenhuma etapa está marcada como "Reunião feita" (Etapas → marco do funil).
                Sem esse mapeamento o banco não tem o que contar: "Reuniões realizadas"
                ficaria sempre em zero sem o time ter falhado.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSave} className="w-full">
        Salvar metas
      </Button>
    </div>
  );
}
