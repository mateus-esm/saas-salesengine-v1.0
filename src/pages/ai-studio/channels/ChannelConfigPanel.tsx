import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  capabilityFor, optionsWithLive, CHANNEL_FIELD_META,
  type ChannelConfigField,
} from "@/lib/channel-capabilities";

interface Props {
  channelId: string;
  channelType: string;
}

export function ChannelConfigPanel({ channelId, channelType }: Props) {
  const { toast } = useToast();
  const cap = capabilityFor(channelType);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Only the keys the user actually touched are sent — the provider accepts a
  // partial body, so an untouched field is never overwritten with a stale read.
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "config", channel_id: channelId },
      });
      if (error) throw error;
      if (data?.message) throw new Error(data.message);
      setConfig(data?.config ?? {});
      setTouched(new Set());
    } catch (err) {
      toast({
        title: "Erro",
        description: `Não foi possível carregar as configurações do canal. ${String((err as any)?.message ?? "")}`.trim(),
        variant: "destructive",
      });
    } finally { setLoading(false); }
  }, [channelId, toast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const setField = (key: string, value: unknown) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setTouched((t) => new Set(t).add(key));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const k of touched) payload[k] = config[k];
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "update-config", channel_id: channelId, config: payload },
      });
      if (error) throw error;
      if (data?.message) throw new Error(data.message);
      setConfig(data?.config ?? config);
      setTouched(new Set());
      toast({ title: "Salvo!", description: "Configurações do canal atualizadas." });
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  if (cap.configFields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Este tipo de canal não possui configurações de conversa.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A disconnected channel returns {} — the fields exist but have no values yet.
  const empty = Object.keys(config).length === 0;

  return (
    <div className="space-y-4">
      {empty && (
        <p className="text-[11px] text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
          Este canal ainda não tem configuração salva. Ajuste os campos e salve para criá-la.
        </p>
      )}

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Comportamento
          </span>
        </div>

        <div className="divide-y divide-border/50">
          {cap.configFields.map((field: ChannelConfigField) => {
            const meta = CHANNEL_FIELD_META[field];
            const value = config[field];
            return (
              <div key={field} className="px-4 py-3 flex items-center justify-between gap-5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">{meta.label}</span>
                  {meta.hint && (
                    <p className="text-[11px] text-muted-foreground leading-snug">{meta.hint}</p>
                  )}
                </div>
                <div className="shrink-0">
                  {meta.type === "switch" && (
                    <Switch
                      checked={value === true}
                      onCheckedChange={(c) => setField(field, c)}
                    />
                  )}
                  {meta.type === "select" && (
                    <Select
                      value={typeof value === "string" ? value : ""}
                      onValueChange={(v) => setField(field, v)}
                    >
                      <SelectTrigger className="w-[210px] h-8">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Includes the live value even if we've never seen it,
                            so saving can't silently rewrite it. */}
                        {optionsWithLive(field, value).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {meta.type === "text" && (
                    <Input
                      className="w-[240px] h-8 text-xs"
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setField(field, e.target.value)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={fetchConfig} disabled={saving || touched.size === 0}>
          Descartar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || touched.size === 0} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando…" : `Salvar${touched.size ? ` (${touched.size})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
