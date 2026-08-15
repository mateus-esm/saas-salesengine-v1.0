import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Webhook, Info, CornerDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// The provider's eight webhook events. Mirrors _shared/agent-webhooks.ts —
// including the provider's own spelling `onLackKnowLedge` (capital L).
const EVENTS: { key: string; label: string; hint: string }[] = [
  { key: "onNewMessage", label: "Nova mensagem", hint: "Disparado a cada mensagem recebida. É o evento que alimenta o inbox." },
  { key: "onFirstInteraction", label: "Primeiro atendimento", hint: "Disparado na primeira interação de um contato." },
  { key: "onStartInteraction", label: "Início do atendimento", hint: "Disparado quando um novo atendimento começa." },
  { key: "onFinishInteraction", label: "Fim do atendimento", hint: "Disparado quando o atendimento é encerrado." },
  { key: "onTransfer", label: "Transferência", hint: "Disparado quando o atendimento é transferido." },
  { key: "onCreateEvent", label: "Novo agendamento", hint: "Disparado quando o agente cria um agendamento." },
  { key: "onCancelEvent", label: "Agendamento cancelado", hint: "Disparado quando um agendamento é cancelado." },
  { key: "onLackKnowLedge", label: "Falta de conhecimento", hint: "Disparado quando o agente não encontra resposta na base de treinamento." },
];

/**
 * Our own inbound endpoint, derived from the configured Supabase URL — never a
 * hardcoded project ref (a wrong one shipped once and silently black-holed
 * every event; see f9910cc).
 */
function ourWebhookUrl(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base}/functions/v1/gpt-maker-webhook` : null;
}

export function WebhooksTab() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-webhooks", {
        method: "GET",
      });
      if (error) throw error;
      setValues(data?.webhooks ?? {});
      setDirty(false);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar os webhooks.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Always send all eight — the function normalizes, and a partial body can
      // never wipe an event we did not render.
      const { data, error } = await supabase.functions.invoke("manage-agent-webhooks?action=update", {
        body: { webhooks: values },
      });
      if (error) throw error;
      setValues(data?.webhooks ?? values);
      setDirty(false);
      toast({ title: "Salvo!", description: "Webhooks atualizados." });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  const setValue = (key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    setDirty(true);
  };

  const ours = ourWebhookUrl();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
        <span>
          Escute eventos do sistema e tome ações, como enviar um webhook. Os eventos que
          alimentam o inbox precisam apontar para o endpoint da plataforma — use{" "}
          <strong className="font-semibold text-foreground/80">Usar endpoint da plataforma</strong>.
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Webhook className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Eventos
          </span>
        </div>

        <div className="divide-y divide-border/50">
          {EVENTS.map((ev) => (
            <div key={ev.key} className="px-5 py-4 space-y-2">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-foreground">{ev.label}</span>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{ev.hint}</p>
                </div>
                {ours && values[ev.key] !== ours && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] gap-1.5 text-muted-foreground shrink-0"
                    onClick={() => setValue(ev.key, ours)}
                  >
                    <CornerDownLeft className="w-3 h-3" />
                    Usar endpoint da plataforma
                  </Button>
                )}
              </div>
              <Input
                className="font-mono text-xs"
                placeholder="https://…"
                value={values[ev.key] ?? ""}
                onChange={(e) => setValue(ev.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={fetchWebhooks} disabled={saving || !dirty}>
          Descartar
        </Button>
        <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2 px-6">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando…" : "Salvar webhooks"}
        </Button>
      </div>
    </div>
  );
}
