import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, MessageSquareText, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  emptySequenceDraft,
  reindexSteps,
  sequenceToDraft,
  type OutreachSequenceDraft,
} from "@/lib/outreach-config";

type Entry = { id: string; name: string; kind: string };
type SoloInstance = { id: string; display_name: string; instance_name: string; status: string };
type GptChannel = { id: string; name?: string | null; username?: string | null; connected?: boolean };
type Profile = {
  provider: "gptmaker" | "solo";
  channel_id: string | null;
  solo_instance_id: string | null;
  send_window_start: string;
  send_window_end: string;
  timezone: string;
  max_sends_per_line_hour: number;
  opt_out_keywords: string[];
};
type ListResponse = {
  sequences: Array<Record<string, unknown>>;
  entries: Entry[];
  solo_instances: SoloInstance[];
  gpt_channels: GptChannel[];
  gpt_channels_error: string | null;
  profile: Profile;
};

async function invokeOutreach(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("outreach", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function OutreachSettings() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("new");
  const [draft, setDraft] = useState<OutreachSequenceDraft>(emptySequenceDraft);
  const [profile, setProfile] = useState<Profile | null>(null);

  const query = useQuery<ListResponse>({
    queryKey: ["outreach-settings"],
    queryFn: () => invokeOutreach({ action: "list-sequences" }),
  });

  useEffect(() => {
    if (query.data?.profile) setProfile(query.data.profile);
  }, [query.data?.profile]);

  const selected = useMemo(
    () => query.data?.sequences.find((sequence) => String(sequence.id) === selectedId),
    [query.data?.sequences, selectedId],
  );
  useEffect(() => {
    setDraft(selected ? sequenceToDraft(selected) : emptySequenceDraft());
  }, [selected]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["outreach-settings"] });
  const saveSequence = useMutation({
    mutationFn: () => invokeOutreach({
      action: "upsert-sequence",
      sequence: { ...draft, steps: undefined },
      steps: draft.steps,
    }),
    onSuccess: async (data) => {
      const id = String(data.sequence.id);
      setSelectedId(id);
      await refresh();
      toast.success("Sequência salva.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });
  const saveProfile = useMutation({
    mutationFn: () => invokeOutreach({ action: "update-profile", profile }),
    onSuccess: async () => {
      await refresh();
      toast.success("Canal e freios atualizados.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });

  if (query.error) {
    return <div className="container mx-auto p-6 text-destructive">Falha ao carregar: {query.error.message}</div>;
  }
  if (query.isLoading || !profile) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const lineValue = profile.provider === "gptmaker" ? profile.channel_id : profile.solo_instance_id;
  const canSaveSequence = Boolean(
    draft.name.trim() && draft.trigger_entry_ids.length === 1 &&
      draft.steps.every((step) => step.message_template.trim()),
  );

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><MessageSquareText className="h-8 w-8" /> Outreach</h1>
        <p className="mt-1 text-muted-foreground">Configure a regra mínima: lead entrou pela porta escolhida → envie a sequência pelo canal escolhido.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Canal e freios de envio</CardTitle>
          <CardDescription>Esta configuração vale para as sequências do tenant. Não há fallback automático entre providers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={profile.provider} onValueChange={(provider: "gptmaker" | "solo") => setProfile({
              ...profile,
              provider,
              channel_id: provider === "gptmaker" ? profile.channel_id : null,
              solo_instance_id: provider === "solo" ? profile.solo_instance_id : null,
            })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gptmaker">GPT Maker (não oficial)</SelectItem>
                <SelectItem value="solo">Solo API</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Linha/canal</Label>
            <Select value={lineValue ?? "none"} onValueChange={(value) => setProfile({
              ...profile,
              channel_id: profile.provider === "gptmaker" && value !== "none" ? value : null,
              solo_instance_id: profile.provider === "solo" && value !== "none" ? value : null,
            })}>
              <SelectTrigger><SelectValue placeholder="Escolha a linha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Escolher automaticamente (somente se houver uma)</SelectItem>
                {profile.provider === "gptmaker"
                  ? query.data.gpt_channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>{channel.name || channel.username || channel.id}{channel.connected === false ? " — desconectado" : ""}</SelectItem>
                  ))
                  : query.data.solo_instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>{instance.display_name || instance.instance_name} — {instance.status}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {profile.provider === "gptmaker" && query.data.gpt_channels_error && (
              <p className="text-xs text-amber-600">Canais GPT Maker indisponíveis: {query.data.gpt_channels_error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Máximo por linha/hora</Label>
            <Input type="number" min={1} max={500} value={profile.max_sends_per_line_hour} onChange={(event) => setProfile({
              ...profile,
              max_sends_per_line_hour: Number(event.target.value),
            })} />
          </div>
          <div className="space-y-2"><Label>Início da janela</Label><Input type="time" value={profile.send_window_start.slice(0, 5)} onChange={(event) => setProfile({ ...profile, send_window_start: event.target.value })} /></div>
          <div className="space-y-2"><Label>Fim da janela</Label><Input type="time" value={profile.send_window_end.slice(0, 5)} onChange={(event) => setProfile({ ...profile, send_window_end: event.target.value })} /></div>
          <div className="space-y-2"><Label>Fuso</Label><Input value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} /></div>
          <div className="flex items-end"><Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}><Save className="mr-2 h-4 w-4" />Salvar canal</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader><CardTitle>Sequências</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant={selectedId === "new" ? "secondary" : "outline"} className="w-full justify-start" onClick={() => setSelectedId("new")}><Plus className="mr-2 h-4 w-4" />Nova sequência</Button>
            {query.data.sequences.map((sequence) => (
              <Button key={String(sequence.id)} variant={selectedId === sequence.id ? "secondary" : "ghost"} className="h-auto w-full justify-between py-3" onClick={() => setSelectedId(String(sequence.id))}>
                <span className="truncate">{String(sequence.name)}</span>
                <Badge variant={sequence.active ? "default" : "secondary"}>{sequence.active ? "Ativa" : "Inativa"}</Badge>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div><CardTitle>Regra e mensagens</CardTitle><CardDescription>Somente o evento de entrada pela porta escolhida é configurado aqui.</CardDescription></div>
              <div className="flex items-center gap-2"><Label htmlFor="sequence-active">Ativa</Label><Switch id="sequence-active" checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} /></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Nome</Label><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
              <div className="space-y-2">
                <Label>Porta de entrada</Label>
                <Select value={draft.trigger_entry_ids[0] ?? "none"} onValueChange={(value) => setDraft({ ...draft, trigger_entry_ids: value === "none" ? [] : [value] })}>
                  <SelectTrigger><SelectValue placeholder="Escolha a porta" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Selecione uma porta</SelectItem>{query.data.entries.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name} ({entry.kind})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="font-medium">Mensagens</h3><p className="text-sm text-muted-foreground">O offset é contado desde a entrada do lead.</p></div><Button variant="outline" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { position: draft.steps.length, offset_minutes: (draft.steps.at(-1)?.offset_minutes ?? 0) + 1440, message_template: "" }] })}><Plus className="mr-2 h-4 w-4" />Mensagem</Button></div>
              {draft.steps.map((step, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-medium"><Clock3 className="h-4 w-4" />Passo {index + 1}</div>{draft.steps.length > 1 && <Button size="icon" variant="ghost" aria-label={`Remover passo ${index + 1}`} onClick={() => setDraft({ ...draft, steps: reindexSteps(draft.steps.filter((_, position) => position !== index)) })}><Trash2 className="h-4 w-4" /></Button>}</div>
                  <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <div className="space-y-2"><Label>Offset (minutos)</Label><Input type="number" min={0} value={step.offset_minutes} onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((current, position) => position === index ? { ...current, offset_minutes: Number(event.target.value) } : current) })} /></div>
                    <div className="space-y-2"><Label>Texto</Label><Textarea rows={3} value={step.message_template} placeholder="Oi {{lead.first_name}}, aqui é da {{tenant.name}}…" onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((current, position) => position === index ? { ...current, message_template: event.target.value } : current) })} /></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end"><Button disabled={!canSaveSequence || saveSequence.isPending} onClick={() => saveSequence.mutate()}>{saveSequence.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar sequência</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
