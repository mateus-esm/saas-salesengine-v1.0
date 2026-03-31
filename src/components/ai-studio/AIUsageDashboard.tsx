import { useState, useEffect } from "react";
import { Cpu, CreditCard, ChevronDown } from "lucide-react";
import { ProviderFactory } from "@/services/ai-studio/ProviderFactory";
import { UsageStats, ModelInfo } from "@/services/ai-studio/types";

export function AIUsageDashboard() {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5.4");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const provider = ProviderFactory.getProvider();
      const [_usage, _models] = await Promise.all([
        provider.getUsage(),
        provider.getModels()
      ]);
      setUsage(_usage);
      setModels(_models);
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground font-mono">Carregando métricas...</div>;
  }

  // Filter models by provider easily
  const providers = Array.from(new Set(models.map(m => m.provider)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-1 md:col-span-2 p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-card-foreground">Consumo de Créditos</h2>
          </div>
          
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-4xl font-bold text-foreground font-mono">{usage?.creditsAvailable}</span>
            <span className="text-sm text-muted-foreground uppercase font-semibold">{usage?.currency}</span>
          </div>
          <div className="mt-8 text-sm text-muted-foreground">
            Você utilizou <span className="font-mono text-foreground font-medium">{usage?.creditsUsed}</span> créditos neste ciclo da sua assinatura.
          </div>
        </div>

        <div className="col-span-1 p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Cpu className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-card-foreground">Modelo Global</h2>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Selecione a inteligência padrão para responder interações.
          </p>

          <div className="relative group">
            <select 
              className="w-full appearance-none bg-background border border-border rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground cursor-pointer"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {providers.map(providerName => (
                <optgroup label={providerName} key={providerName}>
                  {models.filter(m => m.provider === providerName).map(m => (
                    <option value={m.id} key={m.id}>
                      {m.name} ({m.costPerRequest} cr) {m.isDeprecated ? '- Depreciado' : ''} {m.isNew ? '- Novo' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground group-hover:text-foreground">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
