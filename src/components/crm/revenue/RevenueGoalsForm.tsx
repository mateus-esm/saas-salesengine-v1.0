import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Trash2, Target, Users, Settings, BarChart3, TrendingUp } from "lucide-react";
import { OwnerGoal } from "@/types/pipelines";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { useAuth } from "@/contexts/AuthContext";

interface RevenueGoalsFormProps {
  pipelineId: string;
}

interface RevenueGoalsDraft {
  goalDeals: string;
  goalRevenue: string;
  period: string;
  ownerGoals: OwnerGoal[];
  overrides: Record<string, string>;
}

const EMPTY_DRAFT: RevenueGoalsDraft = {
  goalDeals: "",
  goalRevenue: "",
  period: "month",
  ownerGoals: [],
  overrides: {},
};

export function RevenueGoalsForm({ pipelineId }: RevenueGoalsFormProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const draftKey = `revenue_goals_${pipelineId}`;

  const { value: state, setValue: setState, commit, discard, hasDraft } =
    useDraftAutosave<RevenueGoalsDraft>(draftKey, EMPTY_DRAFT);

  const { goalDeals, goalRevenue, period, ownerGoals, overrides } = state;

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
      const ov: Record<string, string> = {};
      if (config.conversion_overrides) {
        for (const [k, v] of Object.entries(config.conversion_overrides)) {
          ov[k] = String(v);
        }
      }
      setState({
        goalDeals: String(config.goal_deals ?? ""),
        goalRevenue: String(config.goal_revenue ?? ""),
        period: config.period ?? "month",
        ownerGoals: config.owner_goals ?? [],
        overrides: ov,
      });
    }
  }, [config, hasDraft, setState]);

  const equipeId = profile?.equipe_id;

  // Team members
  const { data: members = [] } = useQuery({
    queryKey: ["team_members_for_goals", equipeId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("profiles")
        .select("id, name")
        .eq("equipe_id", equipeId);
      return (data ?? []) as { id: string; name: string | null }[];
    },
    enabled: !!equipeId,
  });

  // Conversion rates for preview + overrides
  const { data: rates } = useQuery({
    queryKey: ["stage_rates_for_preview", pipelineId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.rpc("fn_stage_conversion_rates", { p_pipeline_id: pipelineId });
      return (data ?? []) as Array<{ stage_id: string; stage_name: string; conversion_rate: number }>;
    },
    enabled: !!pipelineId,
  });

  const memberName = (id: string): string =>
    members.find((m) => m.id === id)?.name ?? id.slice(0, 8);

  const updateField = (field: keyof RevenueGoalsDraft, value: any) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const sb = supabase as any;
    const existing = config ?? {};
    const conversion_overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(overrides)) {
      const n = parseFloat(v);
      if (!isNaN(n)) conversion_overrides[k] = n;
    }
    const updated = {
      ...existing,
      goal_deals: parseInt(goalDeals) || 0,
      goal_revenue: parseFloat(goalRevenue) || 0,
      period,
      owner_goals: ownerGoals,
      conversion_overrides: Object.keys(conversion_overrides).length > 0 ? conversion_overrides : undefined,
    };
    await sb
      .from("pipelines")
      .update({ revenue_config: updated })
      .eq("id", pipelineId);
    toast.success("Metas salvas");
    commit(); // Clear draft after successful save
    queryClient.invalidateQueries({ queryKey: ["forecast", pipelineId] });
  };

  const goalDealsNum = parseInt(goalDeals) || 0;
  const goalRevenueNum = parseFloat(goalRevenue) || 0;
  const totalOwnerDeals = ownerGoals.reduce((s, g) => s + (g.target_deals || 0), 0);
  const totalOwnerRevenue = ownerGoals.reduce((s, g) => s + (g.target_revenue || 0), 0);
  const ownerDealsMatch = totalOwnerDeals === 0 || totalOwnerDeals === goalDealsNum;
  const ownerRevenueMatch = totalOwnerRevenue === 0 || totalOwnerRevenue === goalRevenueNum;

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
              <label className="text-xs text-muted-foreground font-medium">
                Faturamento alvo (R$)
              </label>
              <Input
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
              <label className="text-xs text-muted-foreground font-medium">
                Negócios alvo
              </label>
              <Input
                type="number"
                value={goalDeals}
                onChange={(e) => updateField("goalDeals", e.target.value)}
                placeholder="Ex.: 20"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Quantidade de vendas fechadas esperadas
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Período
              </label>
              <Select value={period} onValueChange={(val) => updateField("period", val)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mensal</SelectItem>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground/60">
                Período de apuração das metas
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
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
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
                <Input
                  type="number"
                  value={og.target_deals}
                  onChange={(e) => {
                    const updated = [...ownerGoals];
                    updated[idx] = { ...updated[idx], target_deals: parseInt(e.target.value) || 0 };
                    updateField("ownerGoals", updated);
                  }}
                  placeholder="Deals"
                  className="h-8 text-xs w-20"
                />
                <Input
                  type="number"
                  value={og.target_revenue}
                  onChange={(e) => {
                    const updated = [...ownerGoals];
                    updated[idx] = { ...updated[idx], target_revenue: parseFloat(e.target.value) || 0 };
                    updateField("ownerGoals", updated);
                  }}
                  placeholder="R$"
                  className="h-8 text-xs w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
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
              {totalOwnerDeals} negócios / R$ {totalOwnerRevenue.toLocaleString("pt-BR")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3 — Conversion overrides */}
      {rates && rates.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Taxas de Conversão (opcional)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Substitua a taxa histórica por um valor manual se o histórico não
              representar a realidade esperada. Deixe em branco para usar o
              valor real calculado.
            </p>
            <div className="space-y-2">
              {rates.map((r) => {
                const overrideVal = overrides[r.stage_id] ?? "";
                const displayVal = overrideVal
                  ? (parseFloat(overrideVal) * 100).toFixed(0)
                  : (r.conversion_rate * 100).toFixed(0);
                return (
                  <div key={r.stage_id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-40 truncate">
                      {r.stage_name}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                      {displayVal}%
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={overrideVal}
                      onChange={(e) =>
                        updateField("overrides", { ...overrides, [r.stage_id]: e.target.value })
                      }
                      placeholder="Taxa (0–1)"
                      className="h-7 text-xs w-24"
                    />
                    {overrideVal && (
                      <span className="text-[10px] text-amber-500">manual</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {goalDealsNum > 0 && rates && rates.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-semibold text-primary">Projeção</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Com sua taxa atual de conversão, atingir{" "}
              <strong>{goalDealsNum} negócios fechados</strong> (R$ {goalRevenueNum.toLocaleString("pt-BR")}){" "}
              exige aproximadamente:
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              {rates.length > 0 && goalDealsNum > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-background rounded">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  {Math.round(goalDealsNum / rates[rates.length - 1].conversion_rate)} leads no topo do funil
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-background rounded text-muted-foreground">
                Meta {period === "month" ? "mensal" : "trimestral"}: R$ {(goalRevenueNum / (goalDealsNum || 1)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por negócio
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSave} className="w-full">
        Salvar metas
      </Button>
    </div>
  );
}
