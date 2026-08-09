import { useState, useEffect, useCallback } from "react";
import { Loader2, Info, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Settings schema ────────────────────────────────────────────────────────────
// W1 note #1: the edge function returns BOTH shapes, but W2 migrates to the
// nested keys — data.settings.*. The flat keys die in 7.3; never read them.
// W1 note #2: `description` in the UI maps to upstream `jobDescription` inside
// the edge function — the UI keeps using `description`.
type SettingType = "switch" | "select" | "text";

interface SettingConfig {
  key: string;
  label: string;
  type: SettingType;
  group: string;
  options?: { value: string; label: string }[];
}

const MESSAGE_GROUPING_OPTIONS = [
  { value: "NO_GROUP", label: "Sem agrupamento" },
  { value: "FIVE_SEC", label: "5 segundos" },
  { value: "TEN_SEC", label: "10 segundos" },
  { value: "THIRD_SEC", label: "30 segundos" },
  { value: "ONE_MINUTE", label: "1 minuto" },
];

const MAX_DAILY_OPTIONS = [
  { value: "__null__", label: "Sem limite" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "500", label: "500" },
  { value: "1000", label: "1000" },
];

const LIMIT_ACTION_OPTIONS = [
  { value: "TEMP_BLOCK_30S", label: "Bloquear 30s" },
  { value: "TEMP_BLOCK_5M", label: "Bloquear 5min" },
  { value: "TEMP_BLOCK_10M", label: "Bloquear 10min" },
  { value: "TEMP_BLOCK_30M", label: "Bloquear 30min" },
  { value: "TEMP_BLOCK_1H", label: "Bloquear 1h" },
  { value: "BLOCK", label: "Bloquear" },
  { value: "TRANSFER", label: "Transferir para humano" },
];

// Timezone: keep the live value; the PO uses a fixed set, fall back to the raw
// value so we never drop a real timezone.
const TIMEZONES = [
  "America/Fortaleza",
  "America/Sao_Paulo",
  "America/Recife",
  "America/Manaus",
  "America/Belem",
  "America/Brasilia",
  "America/Rio_Branco",
];

const SETTINGS: SettingConfig[] = [
  // ── Conversa ──────────────────────────────────────────────────────────────
  { key: "splitMessages", label: "Dividir resposta em partes", type: "switch", group: "Conversa" },
  { key: "enabledEmoji", label: "Usar emojis nas respostas", type: "switch", group: "Conversa" },
  { key: "signMessages", label: "Assinar nome do agente nas respostas", type: "switch", group: "Conversa" },
  { key: "messageGroupingTime", label: "Tempo de resposta", type: "select", group: "Conversa", options: MESSAGE_GROUPING_OPTIONS },
  { key: "timezone", label: "Timezone do agente", type: "select", group: "Conversa", options: TIMEZONES.map((t) => ({ value: t, label: t })) },
  // ── Atendimento ───────────────────────────────────────────────────────────
  { key: "enabledHumanTransfer", label: "Transferir para humano", type: "switch", group: "Atendimento" },
  { key: "enabledReminder", label: "Permitir registrar lembretes", type: "switch", group: "Atendimento" },
  { key: "maxDailyMessages", label: "Limite de interações por atendimento", type: "select", group: "Atendimento", options: MAX_DAILY_OPTIONS },
  { key: "maxDailyMessagesLimitAction", label: "Ação ao atingir o limite", type: "select", group: "Atendimento", options: LIMIT_ACTION_OPTIONS },
  // ── Conhecimento ──────────────────────────────────────────────────────────
  { key: "knowledgeByFunction", label: "Busca inteligente do treinamento", type: "switch", group: "Conhecimento" },
  { key: "limitSubjects", label: "Restringir temas permitidos", type: "switch", group: "Conhecimento" },
  { key: "onLackKnowLedge", label: "Webhook quando faltar conhecimento", type: "text", group: "Conhecimento" },
];

const groupSettings = (settings: SettingConfig[]) =>
  settings.reduce<Record<string, SettingConfig[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

// Normalize a stored value into a select string ("__null__" for null).
const toSelectValue = (v: unknown): string => (v === null || v === undefined ? "__null__" : String(v));
const fromSelectValue = (v: string): string | null => (v === "__null__" ? null : v);

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Text drafts are local until the user blurs/saves — avoid saving per keystroke.
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-settings");
      if (error) throw error;
      // Nested shape — W1 note #1. data.settings.* is the contract; the flat
      // keys are legacy and die in 7.3.
      setSettings(data?.settings ?? {});
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as configurações.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Step 3: save ONE field at a time, optimistic update + rollback. Never PUT
  // the whole object — it would resend stale values for untouched fields.
  //
  // Exception (PM correction, T6 flag 1): the provider ignores
  // `maxDailyMessagesLimitAction` unless `maxDailyMessages` travels with it.
  // Sent alone it returns success and silently discards the value — the exact
  // failure mode this sprint exists to remove. So the pair is always sent
  // together, and the action control is disabled while no limit is set
  // (the action is meaningless without one).
  const COUPLED = ["maxDailyMessages", "maxDailyMessagesLimitAction"];

  const saveSetting = async (key: string, value: unknown) => {
    const prev = settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    setSavingKey(key);
    try {
      const payload: Record<string, unknown> = { [key]: value };
      if (COUPLED.includes(key)) {
        const other = COUPLED.find((k) => k !== key)!;
        payload[other] = key === "maxDailyMessages" && value === null
          ? null                       // clearing the limit clears the action
          : settings[other];
      }
      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=update-settings",
        { body: payload }
      );
      if (error) throw error;
      toast({ title: "Salvo!", description: "Configuração atualizada." });
    } catch (err) {
      setSettings((s) => ({ ...s, [key]: prev }));
      toast({
        title: "Não foi possível salvar",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setSavingKey(null);
    }
  };

  const onSwitch = (key: string, checked: boolean) => saveSetting(key, checked);
  const onSelect = (key: string, raw: string) => saveSetting(key, fromSelectValue(raw));
  const onTextBlur = (key: string) => {
    const draft = textDrafts[key];
    if (draft === undefined) return;
    setTextDrafts((d) => { const { [key]: _, ...rest } = d; return rest; });
    saveSetting(key, draft);
  };

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
          Parâmetros operacionais do agente, sincronizados em tempo real com a API.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, configs]) => (
            <div key={group} className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  {group}
                </span>
              </div>

              <div className="divide-y divide-border/50">
                {configs.map((cfg) => {
                  const value = settings[cfg.key];
                  // PM correction (T6 flags 1 & 2): two controls need an honest
                  // explanation instead of silently doing nothing.
                  const needsLimitFirst =
                    cfg.key === "maxDailyMessagesLimitAction" &&
                    (settings.maxDailyMessages === null ||
                      settings.maxDailyMessages === undefined);
                  const hint = needsLimitFirst
                    ? "Defina um limite de interações para esta ação ter efeito."
                    : cfg.key === "onLackKnowLedge"
                    ? "O provedor aceita o valor mas não o retorna — o campo volta vazio ao recarregar."
                    : null;
                  return (
                    <div key={cfg.key} className="px-5 py-4 flex items-center justify-between gap-6">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
                        {savingKey === cfg.key && (
                          <span className="ml-2 text-[10px] font-mono text-primary">salvando…</span>
                        )}
                        {hint && (
                          <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {cfg.type === "switch" && (
                          <Switch
                            checked={Boolean(value)}
                            onCheckedChange={(checked) => onSwitch(cfg.key, checked)}
                            disabled={savingKey !== null && savingKey !== cfg.key}
                          />
                        )}
                        {cfg.type === "select" && (
                          <Select
                            value={toSelectValue(value)}
                            onValueChange={(raw) => onSelect(cfg.key, raw)}
                            disabled={
                              needsLimitFirst ||
                              (savingKey !== null && savingKey !== cfg.key)
                            }
                          >
                            <SelectTrigger className="w-[230px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {cfg.options?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {cfg.type === "text" && (
                          <Input
                            className="w-[260px]"
                            placeholder="https://…"
                            defaultValue={typeof value === "string" ? value : ""}
                            onChange={(e) => setTextDrafts((d) => ({ ...d, [cfg.key]: e.target.value }))}
                            onBlur={() => onTextBlur(cfg.key)}
                            disabled={savingKey !== null && savingKey !== cfg.key}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Step 4: known gaps — keeps the PO's expectation honest */}
          <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
            <span>
              Horário de atendimento e moderação de conteúdo ainda não estão disponíveis.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
