import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, ToggleLeft, ToggleRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// API Config key map
interface ConfigKey {
  key: string;
  label: string;
  description: string;
  type: "boolean" | "number" | "string" | "select";
  options?: string[];
  group: string;
}

const CONFIG_KEYS: ConfigKey[] = [
  // Messaging behavior
  {
    key: "splitMessages",
    label: "Dividir Mensagens",
    description: "Divide respostas longas em múltiplas mensagens para parecer mais humano.",
    type: "boolean",
    group: "Comportamento de Mensagens",
  },
  {
    key: "enabledEmoji",
    label: "Emojis Habilitados",
    description: "Permite que o agente use emojis nas respostas.",
    type: "boolean",
    group: "Comportamento de Mensagens",
  },
  {
    key: "maxCharsPerMessage",
    label: "Máx. Chars por Mensagem",
    description: "Número máximo de caracteres por mensagem quando splitMessages está ativo.",
    type: "number",
    group: "Comportamento de Mensagens",
  },
  // Memory & context
  {
    key: "memoryEnabled",
    label: "Memória de Conversa",
    description: "Mantém histórico da conversa para contexto contínuo.",
    type: "boolean",
    group: "Memória & Contexto",
  },
  {
    key: "contextWindowSize",
    label: "Janela de Contexto",
    description: "Número de mensagens anteriores mantidas em contexto.",
    type: "number",
    group: "Memória & Contexto",
  },
  {
    key: "summarizeHistory",
    label: "Sumarizar Histórico",
    description: "Comprime o histórico antigo em um resumo para economizar tokens.",
    type: "boolean",
    group: "Memória & Contexto",
  },
  // Response settings
  {
    key: "temperature",
    label: "Temperatura (Criatividade)",
    description: "0.0 = determinístico, 1.0 = criativo. Recomendado: 0.4–0.7.",
    type: "string",
    group: "Parâmetros de Resposta",
  },
  {
    key: "maxTokens",
    label: "Máx. Tokens por Resposta",
    description: "Limite de tokens na resposta do modelo.",
    type: "number",
    group: "Parâmetros de Resposta",
  },
  {
    key: "responseLanguage",
    label: "Idioma de Resposta",
    description: "Idioma forçado nas respostas (sobrescreve o behavior).",
    type: "select",
    options: ["auto", "pt-BR", "en-US", "es-ES"],
    group: "Parâmetros de Resposta",
  },
  // Operational
  {
    key: "humanHandoffEnabled",
    label: "Handoff Humano",
    description: "Habilita transferência para atendente humano via skill/intenção.",
    type: "boolean",
    group: "Operacional",
  },
  {
    key: "inactivityTimeoutMinutes",
    label: "Timeout de Inatividade (min)",
    description: "Minutos sem resposta do usuário para encerrar a sessão.",
    type: "number",
    group: "Operacional",
  },
  {
    key: "debugMode",
    label: "Modo Debug",
    description: "Loga todas as chamadas à API no console (não usar em produção).",
    type: "boolean",
    group: "Operacional",
  },
];

type ConfigValues = Record<string, string | boolean | number>;

// Group config keys by `group`
function groupKeys(keys: ConfigKey[]) {
  return keys.reduce<Record<string, ConfigKey[]>>((acc, k) => {
    if (!acc[k.group]) acc[k.group] = [];
    acc[k.group].push(k);
    return acc;
  }, {});
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [values, setValues] = useState<ConfigValues>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-settings");
      if (error) throw error;
      if (data) setValues(data);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as configurações.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=update-config",
        { body: values }
      );
      if (error) throw error;
      toast({ title: "Sincronizado!", description: "Configurações salvas com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar configurações.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setValue = (key: string, val: string | boolean | number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const grouped = groupKeys(CONFIG_KEYS);

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Configurações
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mapa completo das chaves de configuração da API do agente.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([group, keys]) => (
            <div key={group} className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  {group}
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {keys.map((config) => (
                  <div key={config.key} className="px-5 py-4 flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{config.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                          {config.key}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{config.description}</p>
                    </div>

                    <div className="shrink-0">
                      {config.type === "boolean" && (
                        <button
                          onClick={() => setValue(config.key, !values[config.key])}
                          className="flex items-center gap-1.5 transition-colors"
                        >
                          {values[config.key] ? (
                            <ToggleRight className="w-8 h-8 text-primary" />
                          ) : (
                            <ToggleLeft className="w-8 h-8 text-muted-foreground/50" />
                          )}
                          <span
                            className={cn(
                              "text-xs font-mono",
                              values[config.key] ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            {values[config.key] ? "ON" : "OFF"}
                          </span>
                        </button>
                      )}

                      {config.type === "number" && (
                        <input
                          type="number"
                          className="w-24 bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground text-right"
                          value={values[config.key] as number ?? ""}
                          onChange={(e) => setValue(config.key, Number(e.target.value))}
                        />
                      )}

                      {config.type === "string" && (
                        <input
                          type="text"
                          className="w-28 bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                          value={values[config.key] as string ?? ""}
                          onChange={(e) => setValue(config.key, e.target.value)}
                        />
                      )}

                      {config.type === "select" && config.options && (
                        <select
                          className="bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                          value={values[config.key] as string ?? "auto"}
                          onChange={(e) => setValue(config.key, e.target.value)}
                        >
                          {config.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Info note */}
          <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Algumas chaves podem não ter efeito se não forem suportadas pela versão atual da API do GPT Maker.
              Consulte a documentação do provider para verificar compatibilidade.
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2 px-8">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
