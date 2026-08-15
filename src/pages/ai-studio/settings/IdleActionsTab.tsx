import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Save, Clock, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// The provider's POST replaces the WHOLE configuration, so this tab edits the
// full set locally and saves it in one call. There is no per-action endpoint.
interface IdleAction {
  id?: string;
  type?: string;
  instructions: string;
  seconds: number;
  allowAllHours: boolean;
}

// Minutes, because that is how the provider's own UI phrases it ("Se não
// responder em 10 minutos"). Converted to seconds at the boundary.
const DELAY_OPTIONS = [1, 2, 5, 10, 15, 30, 60, 120].map((m) => ({
  value: String(m * 60),
  label: m < 60 ? `${m} minutos` : `${m / 60} hora${m > 60 ? "s" : ""}`,
}));

const secondsLabel = (s: number) =>
  DELAY_OPTIONS.find((o) => o.value === String(s))?.label
  ?? (s % 60 === 0 ? `${s / 60} minutos` : `${s} segundos`);

export function IdleActionsTab() {
  const { toast } = useToast();
  const [actions, setActions] = useState<IdleAction[]>([]);
  const [finishSeconds, setFinishSeconds] = useState(600);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-idle-actions", {
        method: "GET",
      });
      if (error) throw error;
      setActions(
        (Array.isArray(data?.actions) ? data.actions : []).map((a: any) => ({
          id: a.id,
          type: a.type,
          instructions: a.instructions ?? "",
          seconds: Number(a.seconds ?? 300),
          allowAllHours: a.allowAllHours !== false,
        }))
      );
      setFinishSeconds(Number(data?.finishOn?.seconds ?? 600));
      setDirty(false);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as ações de inatividade.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-idle-actions?action=save", {
        body: {
          actions: actions.map((a) => ({
            instructions: a.instructions,
            seconds: a.seconds,
            allowAllHours: a.allowAllHours,
          })),
          finishOn: { seconds: finishSeconds },
        },
      });
      if (error) throw error;
      if (Array.isArray(data?.actions)) {
        setActions(data.actions.map((a: any) => ({
          id: a.id, type: a.type,
          instructions: a.instructions ?? "",
          seconds: Number(a.seconds ?? 300),
          allowAllHours: a.allowAllHours !== false,
        })));
        setFinishSeconds(Number(data?.finishOn?.seconds ?? finishSeconds));
      }
      setDirty(false);
      toast({ title: "Salvo!", description: "Ações de inatividade atualizadas." });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  const update = (i: number, patch: Partial<IdleAction>) => {
    setActions((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const remove = (i: number) => {
    setActions((a) => a.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const add = () => {
    setActions((a) => [...a, { instructions: "", seconds: 300, allowAllHours: true }]);
    setDirty(true);
  };

  const invalid = actions.some((a) => !a.instructions.trim() || a.seconds <= 0);

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
          Configure ações que o agente deve executar quando o cliente parar de responder.
          As ações são salvas em conjunto — o provedor substitui toda a configuração a cada gravação.
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Ações de inatividade
            </span>
          </div>
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={add}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar ação
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {actions.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma ação intermediária</p>
              <p className="text-xs text-muted-foreground mt-1">
                O atendimento será finalizado após {secondsLabel(finishSeconds)} sem resposta.
              </p>
            </div>
          ) : (
            actions.map((a, i) => (
              <div key={a.id ?? `new-${i}`} className="border border-border rounded-lg p-4 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                    Ação {i + 1}
                    {a.type && <span className="ml-2 normal-case font-normal">· {a.type}</span>}
                  </span>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 px-2 text-destructive hover:bg-destructive/10"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-muted-foreground">Se não responder em</span>
                  <Select
                    value={String(a.seconds)}
                    onValueChange={(v) => update(i, { seconds: Number(v) })}
                  >
                    <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DELAY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">o agente deve:</span>
                </div>

                <Input
                  placeholder="Ex: Perguntar se o cliente ainda está por perto"
                  value={a.instructions}
                  onChange={(e) => update(i, { instructions: e.target.value })}
                />
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-border bg-muted/20 flex items-center gap-2 flex-wrap text-sm">
          <span className="text-muted-foreground">Finalizar o atendimento após</span>
          <Select
            value={String(finishSeconds)}
            onValueChange={(v) => { setFinishSeconds(Number(v)); setDirty(true); }}
          >
            <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DELAY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">sem resposta.</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={fetchConfig} disabled={saving || !dirty}>Descartar</Button>
        <Button onClick={handleSave} disabled={saving || !dirty || invalid} className="gap-2 px-6">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando…" : "Salvar ações"}
        </Button>
      </div>
    </div>
  );
}
