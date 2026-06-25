import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useQueryClient } from "@tanstack/react-query";

interface RevenueGoalsFormProps {
  pipelineId: string;
}

export function RevenueGoalsForm({ pipelineId }: RevenueGoalsFormProps) {
  const queryClient = useQueryClient();
  const [goalDeals, setGoalDeals] = useState("");
  const [goalRevenue, setGoalRevenue] = useState("");
  const [period, setPeriod] = useState("month");

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
      return rc;
    },
    enabled: !!pipelineId,
  });

  const handleSave = async () => {
    const sb = supabase as any;
    const existing = config ?? {};
    const updated = {
      ...existing,
      goal_deals: parseInt(goalDeals) || 0,
      goal_revenue: parseFloat(goalRevenue) || 0,
      period,
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
      <Button size="sm" onClick={handleSave} className="text-xs">
        Salvar metas
      </Button>
    </div>
  );
}
