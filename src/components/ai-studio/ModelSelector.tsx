import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, ChevronDown, Cpu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GPTMakerProvider } from "@/services/ai-studio/providers/GPTMakerProvider";
import type { ModelInfo } from "@/services/ai-studio/types";
import { cn } from "@/lib/utils";

const provider = new GPTMakerProvider({ apiKey: "" });

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  Anthropic: "bg-orange-500/10 text-orange-700 border-orange-200",
  Meta: "bg-blue-500/10 text-blue-700 border-blue-200",
  Alibaba: "bg-violet-500/10 text-violet-700 border-violet-200",
  Deepseek: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  Maritaca: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
};

export function ModelSelector() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [modelList, settingsRes] = await Promise.all([
        provider.getModels(),
        supabase.functions.invoke("manage-agent-settings"),
      ]);
      setModels(modelList);
      if (!settingsRes.error && settingsRes.data?.model) {
        setCurrentModel(settingsRes.data.model);
      }
    } catch (err) {
      console.error("Error loading models:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelect = async (modelId: string) => {
    setOpen(false);
    if (modelId === currentModel) return;

    setSaving(true);
    const prev = currentModel;
    setCurrentModel(modelId);

    try {
      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=update-model",
        { body: { model: modelId } }
      );
      if (error) throw error;
      toast({ title: "Modelo atualizado", description: `Agente agora usa ${modelId}` });
    } catch (err) {
      console.error("Error saving model:", err);
      setCurrentModel(prev);
      toast({
        title: "Erro",
        description: "Falha ao sincronizar modelo com a API.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedModel = models.find((m) => m.id === currentModel);

  // Group by provider
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
        <Cpu className="w-3.5 h-3.5" />
        Modelo ativo
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-auto py-3 px-4 justify-between gap-3 border border-border bg-background hover:bg-muted/40 font-normal min-w-[260px]"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </span>
            ) : selectedModel ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-sm text-foreground font-mono">
                    {selectedModel.name}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {selectedModel.costPerRequest} cr/msg
                  </span>
                </div>
                {selectedModel.isNew && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                    NEW
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground font-mono text-sm">
                Selecionar modelo...
              </span>
            )}
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[320px] p-0 border border-border" align="start">
          <div className="max-h-[420px] overflow-y-auto">
            {Object.entries(grouped).map(([providerName, providerModels]) => (
              <div key={providerName}>
                <div className="px-3 py-2 border-b border-border/60 bg-muted/30 sticky top-0">
                  <span
                    className={cn(
                      "text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                      PROVIDER_COLORS[providerName] ?? "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {providerName}
                  </span>
                </div>
                <div className="py-1">
                  {providerModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleSelect(model.id)}
                      disabled={model.isDeprecated}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/60 transition-colors",
                        model.isDeprecated && "opacity-40 cursor-not-allowed",
                        model.id === currentModel && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {model.id === currentModel ? (
                          <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground">
                              {model.name}
                            </span>
                            {model.isNew && (
                              <Sparkles className="w-3 h-3 text-primary" />
                            )}
                            {model.isBeta && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                BETA
                              </Badge>
                            )}
                            {model.isDeprecated && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                                DEP.
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {model.id}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {model.costPerRequest} cr/msg
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
