import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UsageCreditsCards } from "./UsageCreditsCards";
import { UsageChart } from "./UsageChart";
import { UsageModelBreakdown } from "./UsageModelBreakdown";
import { AgentUsageData, ModelBreakdown } from "@/types/agent";
import { Loader2 } from "lucide-react";

const defaultModelBreakdown: ModelBreakdown[] = [
  { model: "gpt-4o-mini", credits: 0, percentage: 100, color: "hsl(var(--primary))" },
];

export function AgentUsage() {
  const [usageData, setUsageData] = useState<AgentUsageData | null>(null);
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdown[]>(defaultModelBreakdown);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('fetch-gpt-credits');
      if (error) throw error;

      const now = new Date();
      const periodo = `${now.toLocaleString('pt-BR', { month: 'long' })} ${now.getFullYear()}`;

      setUsageData({
        creditsSpent: data.creditsSpent || 0,
        creditsBalance: data.creditsBalance || 0,
        totalCredits: data.totalCredits || 1000,
        periodo,
        details: data.details || [],
      });

      // If API returns model breakdown, use it; otherwise show single model
      if (data.details && data.details.length > 0) {
        const modelMap: Record<string, number> = {};
        data.details.forEach((d: any) => {
          const model = d.model || 'gpt-4o-mini';
          modelMap[model] = (modelMap[model] || 0) + (d.credits || 0);
        });
        const total = Object.values(modelMap).reduce((a, b) => a + b, 0) || 1;
        const colors = ["hsl(var(--primary))", "#3b82f6", "#10b981", "#f59e0b"];
        const breakdown = Object.entries(modelMap).map(([model, credits], i) => ({
          model,
          credits,
          percentage: Math.round((credits / total) * 100),
          color: colors[i % colors.length],
        }));
        setModelBreakdown(breakdown);
      } else {
        setModelBreakdown([{
          model: "gpt-4o-mini",
          credits: data.creditsSpent || 0,
          percentage: 100,
          color: "hsl(var(--primary))",
        }]);
      }
    } catch (err) {
      console.error("Error fetching usage:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!usageData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Não foi possível carregar os dados de consumo.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UsageCreditsCards data={usageData} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <UsageChart data={usageData.details} periodo={usageData.periodo} />
        </div>
        <div>
          <UsageModelBreakdown models={modelBreakdown} />
        </div>
      </div>
    </div>
  );
}
