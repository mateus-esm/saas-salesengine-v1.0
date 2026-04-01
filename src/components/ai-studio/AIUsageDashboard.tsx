import { useState, useEffect, useCallback } from "react";
import { Cpu, CreditCard, ChevronDown, Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

// Model cost map from GPT Maker
const MODEL_COSTS: Record<string, number> = {
  'gpt-5.4-mini': 2, 'gpt-5.4': 7, 'gpt-5.2': 5, 'gpt-5.1': 4, 'gpt-5': 4,
  'gpt-5-mini': 1, 'gpt-4.1': 4, 'gpt-4.1-mini': 1, 'o4-mini': 3, 'o3': 5,
  'gpt-4o-mini': 1, 'gpt-4o': 5, 'o3-mini': 3, 'o1': 25, 'gpt-4-turbo': 20,
  'claude-4.5-sonnet': 10, 'claude-4.5-haiku': 3, 'claude-3.5-sonnet': 10,
  'claude-3.7-sonnet': 10, 'claude-3.5-haiku': 2, 'llama-3.3': 1,
  'qwen-2.5-max': 3, 'deepseek-v3': 1, 'sabia-3.1': 3, 'sabia-3': 3,
};

const MODELS_BY_PROVIDER: Record<string, { id: string; name: string; cost: number }[]> = {
  'OpenAI': [
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', cost: 2 },
    { id: 'gpt-5.4', name: 'GPT-5.4', cost: 7 },
    { id: 'gpt-5.2', name: 'GPT-5.2', cost: 5 },
    { id: 'gpt-5.1', name: 'GPT-5.1', cost: 4 },
    { id: 'gpt-5', name: 'GPT-5', cost: 4 },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', cost: 1 },
    { id: 'gpt-4.1', name: 'GPT-4.1', cost: 4 },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', cost: 1 },
    { id: 'o4-mini', name: 'o4-Mini', cost: 3 },
    { id: 'o3', name: 'o3', cost: 5 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', cost: 1 },
    { id: 'gpt-4o', name: 'GPT-4o', cost: 5 },
  ],
  'Anthropic': [
    { id: 'claude-4.5-sonnet', name: 'Claude 4.5 Sonnet', cost: 10 },
    { id: 'claude-4.5-haiku', name: 'Claude 4.5 Haiku', cost: 3 },
  ],
  'Meta': [{ id: 'llama-3.3', name: 'LlAMA 3.3', cost: 1 }],
  'Alibaba': [{ id: 'qwen-2.5-max', name: 'Qwen 2.5 Max', cost: 3 }],
  'Deepseek': [{ id: 'deepseek-v3', name: 'Deepseek V3', cost: 1 }],
  'Maritaca': [
    { id: 'sabia-3.1', name: 'Sabiá 3.1', cost: 3 },
    { id: 'sabia-3', name: 'Sabiá 3', cost: 3 },
  ],
};

type DateRange = '7d' | '30d' | 'custom';

export function AIUsageDashboard() {
  const [loading, setLoading] = useState(true);
  const [creditsSpent, setCreditsSpent] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [details, setDetails] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelLoading, setModelLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const { toast } = useToast();

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      const now = new Date();
      const { data, error } = await supabase.functions.invoke('fetch-gpt-credits', {
        body: null,
      });
      if (error) throw error;

      setCreditsSpent(data.creditsSpent || 0);
      setCreditsBalance(data.creditsBalance || 0);
      setTotalCredits(data.totalCredits || 1000);
      setDetails(data.details || []);
    } catch (err) {
      console.error('Error fetching usage:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar dados de consumo.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchAgentSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agent-settings');
      if (error) throw error;
      setSelectedModel(data.prefferModel || 'gpt-4o-mini');
    } catch (err) {
      console.error('Error fetching agent settings:', err);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    fetchAgentSettings();
  }, [fetchUsage, fetchAgentSettings]);

  const handleModelChange = async (newModel: string) => {
    setSelectedModel(newModel);
    setModelLoading(true);
    try {
      const { error } = await supabase.functions.invoke('manage-agent-settings?action=update-model', {
        body: { model: newModel },
      });
      if (error) throw error;
      toast({ title: 'Modelo atualizado', description: `Modelo alterado para ${newModel}` });
    } catch (err) {
      console.error('Error updating model:', err);
      toast({ title: 'Erro ao atualizar modelo', description: 'A API do GPT Maker pode estar indisponível.', variant: 'destructive' });
    } finally {
      setModelLoading(false);
    }
  };

  // Chart data: filter by date range
  const filteredDetails = details.filter((item: any) => {
    if (dateRange === '30d') return true; // already fetching month
    if (dateRange === '7d') {
      const now = new Date();
      const itemDate = new Date(item.year, item.month - 1, item.day);
      const diff = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    }
    return true;
  });

  const chartData = filteredDetails.map((item: any) => ({
    day: `${item.day}/${item.month}`,
    credits: item.credits,
    model: item.model,
  }));

  // Model breakdown
  const modelMap: Record<string, number> = {};
  details.forEach((d: any) => {
    const model = d.model || 'unknown';
    modelMap[model] = (modelMap[model] || 0) + (d.credits || 0);
  });
  const modelBreakdown = Object.entries(modelMap).sort((a, b) => b[1] - a[1]);
  const totalModelCredits = modelBreakdown.reduce((sum, [, v]) => sum + v, 0) || 1;

  const usagePercent = totalCredits > 0 ? Math.min(100, Math.round((creditsSpent / totalCredits) * 100)) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Credits + Model Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Credits Card */}
        <Card className="col-span-1 md:col-span-2 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg"><CreditCard className="w-5 h-5" /></div>
              <CardTitle className="text-lg">Consumo de Créditos</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl font-bold text-foreground font-mono">{creditsBalance.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground font-semibold">/ {totalCredits.toLocaleString()} créditos</span>
            </div>
            <div className="mt-4 w-full bg-muted rounded-full h-2.5">
              <div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${usagePercent}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Utilizados: <span className="font-mono font-medium text-foreground">{creditsSpent.toLocaleString()}</span>
            </p>
          </CardContent>
        </Card>

        {/* Model Selector */}
        <Card className="col-span-1 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg"><Cpu className="w-5 h-5" /></div>
              <CardTitle className="text-lg">Modelo Global</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Inteligência padrão para interações.</p>
            <div className="relative group">
              <select
                className="w-full appearance-none bg-background border border-border rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground cursor-pointer disabled:opacity-50"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={modelLoading}
              >
                {Object.entries(MODELS_BY_PROVIDER).map(([provider, models]) => (
                  <optgroup label={provider} key={provider}>
                    {models.map(m => (
                      <option value={m.id} key={m.id}>{m.name} ({m.cost} cr)</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Consumo Diário</CardTitle>
              <div className="flex gap-1">
                {(['7d', '30d'] as DateRange[]).map(range => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      dateRange === range
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {range === '7d' ? '7 dias' : '30 dias'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`${value} créditos`, 'Consumo']}
                  />
                  <Area type="monotone" dataKey="credits" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorCredits)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Model Breakdown */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Distribuição por Modelo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {modelBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de modelo ainda.</p>
            ) : (
              modelBreakdown.map(([model, credits]) => {
                const pct = Math.round((credits / totalModelCredits) * 100);
                const costPerReq = MODEL_COSTS[model] || 1;
                return (
                  <div key={model} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground truncate">{model}</span>
                      <span className="font-mono text-muted-foreground text-xs">{credits} cr · {costPerReq}/msg</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
