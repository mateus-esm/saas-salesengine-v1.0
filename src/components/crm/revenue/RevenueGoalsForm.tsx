import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { OwnerGoal } from "@/types/pipelines";

interface RevenueGoalsFormProps {
  pipelineId: string;
}

export function RevenueGoalsForm({ pipelineId }: RevenueGoalsFormProps) {
  const queryClient = useQueryClient();
  const [goalDeals, setGoalDeals] = useState("");
  const [goalRevenue, setGoalRevenue] = useState("");
  const [period, setPeriod] = useState("month");
  const [ownerGoals, setOwnerGoals] = useState<OwnerGoal[]>([]);

  const { data: config } = useQuery({
    queryKey: ["revenue_config", pipelineId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("pipelines")
        .select("revenue_config")
        .eq("id", pipelineId)
        .single();
      const rc = data?.revenue_config ?? {};
      setGoalDeals(String(rc.goal_deals ?? ""));
      setGoalRevenue(String(rc.goal_revenue ?? ""));
      setPeriod(rc.period ?? "month");
      setOwnerGoals(rc.owner_goals ?? []);
      return rc;
    },
    enabled: !!pipelineId,
  });

  // Team members for the per-owner goal picker (RLS scopes to the equipe).
  const { data: members = [] } = useQuery({
    queryKey: ["team_members_for_goals"],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb.from("profiles").select("id, name");
      return (data ?? []) as { id: string; name: string | null }[];
    },
  });

  const handleSave = async () => {
    const sb = supabase as any;
    const existing = config ?? {};
    const updated = {
      ...existing,
      goal_deals: parseInt(goalDeals) || 0,
      goal_revenue: parseFloat(goalRevenue) || 0,
      period,
      owner_goals: ownerGoals,
    };
    await sb
      .from("pipelines")
      .update({ revenue_config: updated })
      .eq("id", pipelineId);
    toast.success("Metas salvas");
    queryClient.invalidateQueries({ queryKey: ["forecast", pipelineId] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-24">
          Meta (deals)
        </label>
        <Input
          type="number"
          value={goalDeals}
          onChange={(e) => setGoalDeals(e.target.value)}
          className="h-7 text-xs w-24"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-24">
          Meta (R$)
        </label>
        <Input
          type="number"
          value={goalRevenue}
          onChange={(e) => setGoalRevenue(e.target.value)}
          className="h-7 text-xs w-24"
          placeholder="0,00"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-24">Período</label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mensal</SelectItem>
            <SelectItem value="quarter">Trimestral</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Owner goals section */}
      <div className="border-t pt-3 mt-3">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">
          Metas por vendedor
        </h4>
        {ownerGoals.map((og, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <Select
              value={og.owner_id || undefined}
              onValueChange={(val) => {
                const updated = [...ownerGoals];
                updated[idx] = { ...updated[idx], owner_id: val };
                setOwnerGoals(updated);
              }}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
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
                setOwnerGoals(updated);
              }}
              placeholder="Deals"
              className="h-7 text-xs w-20"
            />
            <Input
              type="number"
              value={og.target_revenue}
              onChange={(e) => {
                const updated = [...ownerGoals];
                updated[idx] = { ...updated[idx], target_revenue: parseFloat(e.target.value) || 0 };
                setOwnerGoals(updated);
              }}
              placeholder="R$"
              className="h-7 text-xs w-24"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOwnerGoals(ownerGoals.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="text-xs w-full"
          onClick={() => setOwnerGoals([...ownerGoals, { owner_id: "", target_deals: 0, target_revenue: 0 }])}
        >
          <Plus className="h-3 w-3 mr-1" /> Adicionar vendedor
        </Button>
      </div>
      <Button size="sm" onClick={handleSave} className="text-xs">
        Salvar metas
      </Button>
    </div>
  );
}
