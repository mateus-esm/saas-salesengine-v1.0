import { useState, useEffect, useCallback } from "react";
import { Loader2, Info, Settings2, PauseCircle, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Settings schema ──────────────────────────────────────────────────────────
// Reads data.settings.* (the nested contract). `description` in the UI maps to
// upstream `jobDescription` inside the edge function.
//
// `onLackKnowLedge` is NOT here. It lives on the agent's WEBHOOKS resource, not
// on /settings — until 7.3 this page offered a field for it that posted to
// update-settings, where the provider accepted the request and discarded the
// value. It now lives in the Webhooks tab, where it works.
type SettingType = "switch" | "select";

interface SettingConfig {
  key: string;
  label: string;
  hint?: string;
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
  { value: "20", label: "20 interações" },
  { value: "50", label: "50 interações" },
  { value: "100", label: "100 interações" },
  { value: "200", label: "200 interações" },
  { value: "500", label: "500 interações" },
  { value: "1000", label: "1000 interações" },
];

const LIMIT_ACTION_OPTIONS = [
  { value: "TEMP_BLOCK_30S", label: "Bloquear por 30s" },
  { value: "TEMP_BLOCK_5M", label: "Bloquear por 5min" },
  { value: "TEMP_BLOCK_10M", label: "Bloquear por 10min" },
  { value: "TEMP_BLOCK_30M", label: "Bloquear por 30min" },
  { value: "TEMP_BLOCK_1H", label: "Bloquear por 1h" },
  { value: "BLOCK", label: "Bloquear" },
  { value: "TRANSFER", label: "Transferir para humano" },
];

// Keep the live value even if it is outside this list — never drop a real
// timezone just because it is not one we anticipated.
const TIMEZONES = [
  "America/Fortaleza", "America/Sao_Paulo", "America/Recife", "America/Manaus",
  "America/Belem", "America/Brasilia", "America/Rio_Branco",
];

const SETTINGS: SettingConfig[] = [
  // ── Conversa ───────────────────────────────────────────────────────────────
  { key: "splitMessages", label: "Dividir resposta em partes", hint: "Em caso da mensagem ficar grande, o agente pode separar em várias mensagens.", type: "switch", group: "Conversa" },
  { key: "enabledEmoji", label: "Usar emojis nas respostas", hint: "Define se o agente pode utilizar emojis em suas respostas.", type: "switch", group: "Conversa" },
  { key: "signMessages", label: "Assinar nome do agente nas respostas", hint: "O agente adiciona automaticamente sua assinatura em cada resposta enviada.", type: "switch", group: "Conversa" },
  { key: "messageGroupingTime", label: "Tempo de resposta", hint: "Intervalo que o agente espera antes de responder.", type: "select", group: "Conversa", options: MESSAGE_GROUPING_OPTIONS },
  { key: "timezone", label: "Timezone do agente", hint: "Usado para datas, por exemplo ao agendar reuniões.", type: "select", group: "Conversa", options: TIMEZONES.map((t) => ({ value: t, label: t })) },
  // ── Atendimento ────────────────────────────────────────────────────────────
  { key: "enabledHumanTransfer", label: "Transferir para humano", hint: "Permite que o agente transfira o atendimento para a aba 'em espera' da equipe humana.", type: "switch", group: "Atendimento" },
  { key: "resumeTransferHumanAI", label: "Resumo ao transferir para humano", hint: "Gera automaticamente um resumo do atendimento ao transferir a conversa para um atendente.", type: "switch", group: "Atendimento" },
  { key: "enabledReminder", label: "Permitir registrar lembretes", hint: "O agente pode registrar lembretes ao usuário.", type: "switch", group: "Atendimento" },
  { key: "maxDailyMessages", label: "Limite de interações por atendimento", hint: "Quantidade de interações que o agente aceita por atendimento.", type: "select", group: "Atendimento", options: MAX_DAILY_OPTIONS },
  { key: "maxDailyMessagesLimitAction", label: "Ação ao atingir limite", hint: "O que acontece ao atingir o limite de interações.", type: "select", group: "Atendimento", options: LIMIT_ACTION_OPTIONS },
  // ── Conhecimento ───────────────────────────────────────────────────────────
  { key: "knowledgeByFunction", label: "Busca inteligente do treinamento", hint: "O agente consulta a base de treinamentos no momento certo, para trazer respostas mais precisas.", type: "switch", group: "Conhecimento" },
  { key: "limitSubjects", label: "Restringir temas permitidos", hint: "O agente não fala sobre outros assuntos.", type: "switch", group: "Conhecimento" },
];

const groupSettings = (settings: SettingConfig[]) =>
  settings.reduce<Record<string, SettingConfig[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

const toSelectValue = (v: unknown): string => (v === null || v === undefined ? "__null__" : String(v));
const fromSelectValue = (v: string): string | null => (v === "__null__" ? null : v);

// The provider ignores `maxDailyMessagesLimitAction` unless `maxDailyMessages`
// travels with it — sent alone it returns success and discards the value, the
// exact silent-failure mode this sprint exists to remove. Always send the pair.
const COUPLED = ["maxDailyMessages", "maxDailyMessagesLimitAction"];

export function ConversaTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [agentStatus, setAgentStatus] = useState<string>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-settings", {
        method: "GET",
      });
      if (error) throw error;
      setSettings(data?.settings ?? {});
      setAgentStatus(data?.agent?.status ?? "ACTIVE");
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as configurações.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // The provider has no business-hours API, but an agent can be silenced.
  // Founder chose a manual toggle over a scheduled one (2026-08-15).
  const toggleAgentStatus = async (active: boolean) => {
    const next = active ? "ACTIVE" : "INACTIVE";
    const prev = agentStatus;
    setAgentStatus(next);
    setSavingKey("__status__");
    try {
      const { error } = await supabase.functions.invoke(
        "manage-agent-settings?action=set-status",
        { body: { status: next } }
      );
      if (error) throw error;
      toast({
        title: active ? "Agente ativado" : "Agente pausado",
        description: active
          ? "O agente voltou a responder em todos os canais."
          : "O agente parou de responder em todos os canais.",
      });
    } catch (err) {
      setAgentStatus(prev);
      toast({
        title: "Não foi possível alterar o status",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally { setSavingKey(null); }
  };

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Save ONE field at a time, optimistic + rollback. Never PUT the whole object
  // — that would resend stale values for untouched fields.
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

  const grouped = groupSettings(SETTINGS);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const paused = agentStatus !== "ACTIVE";

  return (
    <div className="space-y-5">
      {/* Agent on/off — the closest thing the provider offers to "horário de
          atendimento". Deliberately at the top: it overrides everything below. */}
      <div className={cn(
        "border rounded-lg overflow-hidden",
        paused ? "border-amber-300/60 bg-amber-500/5" : "border-border bg-card"
      )}>
        <div className="px-5 py-4 flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              {paused
                ? <PauseCircle className="w-4 h-4 text-amber-600 shrink-0" />
                : <PlayCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
              <span className="text-sm font-semibold text-foreground">
                {paused ? "Agente pausado" : "Agente ativo"}
              </span>
              {savingKey === "__status__" && (
                <span className="text-[10px] font-mono text-primary">salvando…</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {paused
                ? "O agente não está respondendo em nenhum canal. As mensagens continuam chegando ao inbox."
                : "Pause para o agente parar de responder — vale para todos os canais ao mesmo tempo, não é por canal."}
            </p>
          </div>
          <div className="shrink-0">
            <Switch
              checked={!paused}
              onCheckedChange={toggleAgentStatus}
              disabled={savingKey !== null && savingKey !== "__status__"}
            />
          </div>
        </div>
      </div>

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
              // The action control is meaningless with no limit set, and the
              // provider silently ignores it — say so instead of doing nothing.
              const needsLimitFirst =
                cfg.key === "maxDailyMessagesLimitAction" &&
                (settings.maxDailyMessages === null || settings.maxDailyMessages === undefined);
              const hint = needsLimitFirst
                ? "Defina um limite de interações para esta ação ter efeito."
                : cfg.hint;

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
                        onCheckedChange={(checked) => saveSetting(cfg.key, checked)}
                        disabled={savingKey !== null && savingKey !== cfg.key}
                      />
                    )}
                    {cfg.type === "select" && (
                      <Select
                        value={toSelectValue(value)}
                        onValueChange={(raw) => saveSetting(cfg.key, fromSelectValue(raw))}
                        disabled={needsLimitFirst || (savingKey !== null && savingKey !== cfg.key)}
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Says WHY, not just "não disponível" — the reasons are different and
          both are real constraints, not backlog. */}
      <div className="space-y-2.5">
        <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
          <span>
            <strong className="font-semibold text-foreground/80">Horário de atendimento</strong>{" "}
            não existe como agenda no provedor. O mais próximo é pausar o agente no botão acima.
            Horários por ação podem ser definidos em <em>Ações de inatividade</em>.
          </span>
        </div>
        <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
          <span>
            <strong className="font-semibold text-foreground/80">Moderação de conteúdo</strong>{" "}
            não é oferecida pelo provedor, e não temos como suprir: recebemos a notificação da
            mensagem <em>depois</em> que o agente já respondeu, então não há como bloquear uma
            resposta antes dela sair.
          </span>
        </div>
      </div>
    </div>
  );
}
