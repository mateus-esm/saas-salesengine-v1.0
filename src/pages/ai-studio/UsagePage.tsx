import { useState, useEffect, useCallback } from "react";
import { Cpu, Loader2, Sparkles } from "lucide-react";
import { AIUsageDashboard } from "@/components/ai-studio/AIUsageDashboard";
import { ModelSelector } from "@/components/ai-studio/ModelSelector";
import { supabase } from "@/integrations/supabase/client";

function ActiveModelBadge() {
  const [model, setModel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchModel = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-settings");
      if (!error && data?.prefferModel) setModel(data.prefferModel);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchModel(); }, [fetchModel]);

  // Normalize internal enum to display name
  const displayModel = model
    .replace('GPT_5_4_MINI', 'gpt-5.4-mini')
    .replace('GPT_5_4', 'gpt-5.4')
    .replace('GPT_4O_MINI', 'gpt-4o-mini')
    .replace('GPT_4O', 'gpt-4o')
    .replace(/_/g, '-')
    .toLowerCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
      <div className="p-2 bg-primary/8 text-primary rounded border border-primary/15">
        <Cpu className="w-4 h-4" />
      </div>
      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
          Modelo Ativo
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mt-0.5" />
        ) : (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono font-bold text-base text-foreground tracking-tight">
              {displayModel || '—'}
            </span>
            <Sparkles className="w-3.5 h-3.5 text-primary/70" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsagePage() {
  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Uso & Dados
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Uso & Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitoramento granular de consumo por modelo e seleção do modelo ativo do agente.
        </p>
      </div>

      {/* Model config row */}
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 border border-border rounded-lg bg-card">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Configuração do Modelo</h3>
          <p className="text-xs text-muted-foreground">
            Seleção sincronizada em tempo real com o AI Engine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ActiveModelBadge />
          <ModelSelector />
        </div>
      </div>

      {/* Dashboard */}
      <AIUsageDashboard />
    </div>
  );
}
