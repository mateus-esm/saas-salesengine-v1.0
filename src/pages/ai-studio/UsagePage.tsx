import { AIUsageDashboard } from "@/components/ai-studio/AIUsageDashboard";
import { ModelSelector } from "@/components/ai-studio/ModelSelector";

export default function UsagePage() {
  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-8">
      {/* Page Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Uso & Dados
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Uso & Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitoramento granular de consumo por modelo e seleção do modelo ativo.
        </p>
      </div>

      {/* Model Selector */}
      <div className="p-5 border border-border rounded-lg bg-card space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Modelo do Agente</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seleção sincronizada em tempo real com a API do GPT Maker.
            </p>
          </div>
          <ModelSelector />
        </div>
      </div>

      {/* Dashboard */}
      <AIUsageDashboard />
    </div>
  );
}
