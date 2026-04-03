import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, ToggleLeft, ToggleRight, Info, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Settings schema ────────────────────────────────────────────────────────────
interface SettingConfig {
  key: string;
  apiKey: string;              // exact field name in PUT /v2/agent/{id}
  label: string;
  description: string;
  type: "boolean" | "number" | "select";
  options?: string[];
  unit?: string;
  group: string;
}

const SETTINGS: SettingConfig[] = [
  {
    key: "splitMessages",
    apiKey: "splitMessages",
    label: "Dividir Mensagens",
    description: "Quebra respostas longas em múltiplas mensagens para simular digitação humana.",
    type: "boolean",
    group: "Comportamento de Envio",
  },
  {
    key: "enabledEmoji",
    apiKey: "enabledEmoji",
    label: "Emojis Habilitados",
    description: "Permite que o agente use emojis nas respostas.",
    type: "boolean",
    group: "Comportamento de Envio",
  },
  {
    key: "messageGroupingTime",
    apiKey: "messageGroupingTime",
    label: "Tempo de Agrupamento (ms)",
    description: "Janela de tempo em milissegundos para agrupar mensagens consecutivas antes de processar. Null = desabilitado.",
    type: "number",
    unit: "ms",
    group: "Comportamento de Envio",
  },
  {
    key: "knowledgeByFunction",
    apiKey: "knowledgeByFunction",
    label: "Knowledge por Function Call",
    description: "Usa function calling para recuperar conhecimento seletivo em vez de injetar todo o contexto de uma vez. Recomendado para agentes com grande base de conhecimento.",
    type: "boolean",
    group: "Motor de Conhecimento",
  },
];

const groupSettings = (settings: SettingConfig[]) =>
  settings.reduce<Record<string, SettingConfig[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

// ── Component ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, any>>({});
  const [original, setOriginal] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-settings");
      if (error) throw error;
      const vals = {
        splitMessages: data.splitMessages ?? false,
        enabledEmoji: data.enabledEmoji ?? false,
        messageGroupingTime: data.messageGroupingTime ?? "",
        knowledgeByFunction: data.knowledgeByFunction ?? false,
      };
      setValues(vals);
      setOriginal(vals);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as configurações.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send keys that changed
      const changed: Record<string, any> = {};
      for (const key of Object.keys(values)) {
        if (values[key] !== original[key]) {
          changed[key] = values[key] === "" ? null : values[key];
        }
      }

      if (Object.keys(changed).length === 0) {
        toast({ description: "Nenhuma alteração detectada." });
        return;
      }

      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=update-settings",
        { body: changed }
      );
      if (error) throw error;
      setOriginal({ ...values });
      toast({ title: "Sincronizado!", description: "Configurações salvas com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar configurações.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const set = (key: string, val: any) => setValues((p) => ({ ...p, [key]: val }));

  const hasChanges = Object.keys(values).some((k) => values[k] !== original[k]);
  const grouped = groupSettings(SETTINGS);

  return (
    <div className="p-6 lg:p-8 max-w-[820px] mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Configurações
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Parâmetros operacionais do agente sincronizados via <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">PUT /v2/agent/:id</code>.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, settings]) => (
            <div key={group} className="border border-border rounded-lg overflow-hidden bg-card">
              {/* Group header */}
              <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  {group}
                </span>
              </div>

              <div className="divide-y divide-border/50">
                {settings.map((cfg) => (
                  <div key={cfg.key} className="px-5 py-4 flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
                        <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground/80">
                          {cfg.apiKey}
                        </code>
                        {values[cfg.key] !== original[cfg.key] && (
                          <span className="text-[10px] font-mono text-primary bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded">
                            modificado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{cfg.description}</p>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {cfg.type === "boolean" && (
                        <button
                          onClick={() => set(cfg.key, !values[cfg.key])}
                          className="flex items-center gap-1.5 transition-colors group"
                        >
                          {values[cfg.key] ? (
                            <ToggleRight className="w-9 h-9 text-primary" />
                          ) : (
                            <ToggleLeft className="w-9 h-9 text-muted-foreground/40 group-hover:text-muted-foreground" />
                          )}
                          <span className={cn(
                            "text-xs font-mono w-6",
                            values[cfg.key] ? "text-primary font-bold" : "text-muted-foreground"
                          )}>
                            {values[cfg.key] ? "ON" : "OFF"}
                          </span>
                        </button>
                      )}

                      {cfg.type === "number" && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            className="w-24 bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground text-right"
                            value={values[cfg.key] ?? ""}
                            placeholder="null"
                            onChange={(e) => set(cfg.key, e.target.value === "" ? "" : Number(e.target.value))}
                          />
                          {cfg.unit && (
                            <span className="text-xs font-mono text-muted-foreground">{cfg.unit}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* API field mapping note */}
          <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
            <span>
              Estes campos mapeiam diretamente para o payload do endpoint{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded">PUT /v2/agent/:agentId</code>.
              Apenas os campos modificados são enviados (patch seletivo).
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSettings}
              disabled={loading}
              className="text-xs text-muted-foreground"
            >
              Descartar alterações
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="gap-2 px-8"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Sincronizando..." : "Salvar Configurações"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
