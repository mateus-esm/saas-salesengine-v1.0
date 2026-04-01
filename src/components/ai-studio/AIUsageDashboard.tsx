import { useState, useEffect, useCallback, useMemo } from "react";
import { Cpu, CreditCard, Loader2, BarChart2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UsageFilter, PresetRange } from "./UsageFilter";

const MODEL_COSTS: Record<string, number> = {
  'gpt-5.4-mini': 2, 'gpt-5.4': 7, 'gpt-5.2': 5, 'gpt-5.1': 4, 'gpt-5': 4,
  'gpt-5-mini': 1, 'gpt-4.1': 4, 'gpt-4.1-mini': 1, 'o4-mini': 3, 'o3': 5,
  'gpt-4o-mini': 1, 'gpt-4o': 5, 'o3-mini': 3, 'o1': 25, 'gpt-4-turbo': 20,
  'claude-4.5-sonnet': 10, 'claude-4.5-haiku': 3, 'claude-3.5-sonnet': 10,
  'claude-3.7-sonnet': 10, 'claude-3.5-haiku': 2, 'llama-3.3': 1,
  'qwen-2.5-max': 3, 'deepseek-v3': 1, 'sabia-3.1': 3, 'sabia-3': 3,
};

const MODEL_COLORS: Record<string, string> = {
  'gpt-4o': '#10a37f', 'gpt-4o-mini': '#10a37f80',
  'claude-3.5-sonnet': '#d97757', 'claude-3.5-haiku': '#d9775780',
  'gemini-1.5-pro': '#1a73e8', 'gemini-1.5-flash': '#1a73e880',
  'llama-3.3': '#0668E1', 'deepseek-v3': '#4d6bfe',
};

const getRandomColor = (model: string) => {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model];
  const hash = model.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  return `hsl(${hash % 360}, 70%, 50%)`;
};

export function AIUsageDashboard() {
  const [loading, setLoading] = useState(true);
  const [creditsSpent, setCreditsSpent] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [details, setDetails] = useState<any[]>([]);
  
  // Date Filter State
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [activePreset, setActivePreset] = useState<PresetRange>('thisMonth');
  
  const { toast } = useToast();

  const fetchUsage = useCallback(async () => {
    if (!date?.from) return;
    try {
      setLoading(true);
      
      // Calculate months to fetch based on date range
      // For now, Edge Function accepts '?year=&month=' for a single month.
      // In a real scenario, we'd pass ?from= & ?to= to the Edge Function.
      // Since GPT Maker API v2 limits to year/month, we'll request the month of the `from` date.
      const targetYear = date.from.getFullYear();
      const targetMonth = date.from.getMonth() + 1;

      const { data, error } = await supabase.functions.invoke(`fetch-gpt-credits?year=${targetYear}&month=${targetMonth}`, {
        body: null,
      });
      if (error) throw error;

      setCreditsBalance(data.creditsBalance || 0);
      setTotalCredits(data.totalCredits || 1000);
      setDetails(data.details || []);

    } catch (err) {
      console.error('Error fetching usage:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar dados de consumo.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [date, toast]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Process data for stacked bar chart and filter by exact selected dates
  const { chartData, modelKeys, totalFilteredSpent, modelBreakdown } = useMemo(() => {
    if (!details.length || !date?.from) return { chartData: [], modelKeys: [], totalFilteredSpent: 0, modelBreakdown: [] };

    const fromTime = date.from.getTime();
    const toTime = date.to ? date.to.getTime() : fromTime;

    // Filter details by the exact start/end dates
    const inRangeDetails = details.filter(d => {
      const dDate = new Date(d.year, d.month - 1, d.day).getTime();
      return dDate >= fromTime && dDate <= toTime;
    });

    const dailyMap = new Map<string, any>();
    const modelsSet = new Set<string>();
    let totalSpent = 0;
    const breakdownMap: Record<string, number> = {};

    inRangeDetails.forEach(d => {
      const dayKey = `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}`;
      const model = d.model || 'unknown';
      const credits = d.credits || 0;

      modelsSet.add(model);
      totalSpent += credits;
      breakdownMap[model] = (breakdownMap[model] || 0) + credits;

      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, { day: dayKey });
      }
      
      const dayData = dailyMap.get(dayKey);
      dayData[model] = (dayData[model] || 0) + credits;
    });

    const breakdownArr = Object.entries(breakdownMap)
      .sort((a, b) => b[1] - a[1]) // highest first
      .map(([model, credits]) => ({ 
        model, 
        credits, 
        color: getRandomColor(model),
        costPerReq: MODEL_COSTS[model] || '-' 
      }));

    // Sort chart entries chronologically
    const sortedChartData = Array.from(dailyMap.values()).sort((a, b) => {
      const [dayA, monthA] = a.day.split('/');
      const [dayB, monthB] = b.day.split('/');
      return new Date(2000, Number(monthA)-1, Number(dayA)).getTime() - new Date(2000, Number(monthB)-1, Number(dayB)).getTime();
    });

    return { 
      chartData: sortedChartData, 
      modelKeys: Array.from(modelsSet), 
      totalFilteredSpent: totalSpent,
      modelBreakdown: breakdownArr
    };
  }, [details, date]);

  const usagePercent = totalCredits > 0 ? Math.min(100, Math.round((totalFilteredSpent / totalCredits) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Usage & Analytics</h2>
          <p className="text-sm text-muted-foreground">Monitoramento granular de consumo por modelo de IA.</p>
        </div>
        <UsageFilter 
          date={date} 
          setDate={setDate} 
          activePreset={activePreset} 
          onPresetSelect={setActivePreset} 
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="col-span-1 md:col-span-3 lg:col-span-1 border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg"><CreditCard className="w-5 h-5" /></div>
                  <CardTitle className="text-lg">Consumo no Período</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-bold text-foreground font-mono">{totalFilteredSpent.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground font-semibold">créditos</span>
                </div>
                <div className="mt-4 w-full bg-muted rounded-full h-2.5">
                  <div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${usagePercent}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                  <span>{usagePercent}% do limite</span>
                  <span>Saldo total: <span className="font-mono font-medium">{creditsBalance.toLocaleString()}</span></span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-3 lg:col-span-2 border-border/50">
               <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg"><BarChart2 className="w-5 h-5" /></div>
                  <CardTitle className="text-lg">Breakdown por Modelo</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {modelBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum consumo no período selecionado.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {modelBreakdown.map(item => (
                      <div key={item.model} className="p-3 rounded-lg border border-border bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="font-semibold text-sm text-foreground truncate">{item.model}</span>
                        </div>
                        <div className="flex justify-between text-xs mt-2">
                          <span className="text-muted-foreground font-mono">{item.costPerReq} cr/msg</span>
                          <span className="font-mono font-bold text-foreground">{item.credits} cr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Consumo Diário (Barras Empilhadas)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Gráfico indisponível para o período (sem dados registrados).
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: '8px' }}
                        cursor={{ fill: 'hsl(var(--muted))' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                      {modelKeys.map(model => (
                        <Bar 
                          key={model} 
                          dataKey={model} 
                          stackId="a" 
                          fill={getRandomColor(model)} 
                          radius={modelKeys.indexOf(model) === modelKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} 
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
