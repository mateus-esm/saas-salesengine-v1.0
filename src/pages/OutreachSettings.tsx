import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, Loader2, MessageSquareText, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MessageTemplateField } from "@/components/outreach/MessageTemplateField";
import { supabase } from "@/integrations/supabase/client";
import { templateProblems } from "@/lib/message-variables";
import {
  emptySequenceDraft,
  reindexSteps,
  sequenceToDraft,
  type OutreachSequenceDraft,
} from "@/lib/outreach-config";

// SE-REV-005: `label` já vem desambiguado do servidor (nome + tipo, e o começo
// do id se ainda repetir). Portas que existem mas não recebem lead (webhook
// apagado/inativo, porta desligada) chegam em `hidden_entries`, com o motivo.
type Entry = { id: string; name: string; kind: string; label?: string };
type HiddenEntry = { id: string; name: string; kind: string; reason: string };
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
  // Mensagem de abertura (conversation_opener_settings, gravada pelo
  // start-conversation/update-settings).
  enabled?: boolean;
  first_message?: string | null;
  trigger_entry_ids?: string[];
};
type Opener = { enabled: boolean; first_message: string; trigger_entry_ids: string[] };
type ListResponse = {
  sequences: Array<Record<string, unknown>>;
  entries: Entry[];
  hidden_entries?: HiddenEntry[];
  tenant_name?: string | null;
  solo_instances: SoloInstance[];
  gpt_channels: GptChannel[];
  gpt_channels_error: string | null;
  profile: Profile;
};

const HIDDEN_REASON: Record<string, string> = {
  webhook_deleted: "webhook apagado",
  webhook_inactive: "webhook desativado",
  webhook_other_team: "webhook de outro time",
  inactive: "porta desativada",
};

// Resposta não-2xx chega como erro genérico ("non-2xx status code"); a
// mensagem útil (ex.: variável inexistente) está no corpo.
async function invokeFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<Record<string, unknown>> } }).context;
    const payload = typeof context?.json === "function" ? await context.json().catch(() => null) : null;
    const message = payload?.error ?? payload?.message;
    throw new Error(typeof message === "string" && message ? message : error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
const invokeOutreach = (body: Record<string, unknown>) => invokeFunction("outreach", body);

const entryLabel = (entry: Entry) => entry.label ?? `${entry.name} (${entry.kind})`;

export default function OutreachSettings() {
  const queryClient = useQueryClient();
  // null = ainda não escolhido. SE-REV-004: começar em "new" fazia quem voltava
  // à tela ver um formulário em branco no lugar da regra salva; ao "ajustar" e
  // salvar, criava uma segunda sequência e a original nunca mudava.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OutreachSequenceDraft>(emptySequenceDraft);
  const loadedId = useRef<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opener, setOpener] = useState<Opener | null>(null);

  const query = useQuery<ListResponse>({
    queryKey: ["outreach-settings"],
    queryFn: () => invokeOutreach({ action: "list-sequences" }),
  });

  useEffect(() => {
    if (!query.data?.profile) return;
    const loaded = query.data.profile;
    setProfile(loaded);
    setOpener({
      enabled: loaded.enabled === true,
      first_message: loaded.first_message ?? "",
      trigger_entry_ids: Array.isArray(loaded.trigger_entry_ids) ? loaded.trigger_entry_ids.map(String) : [],
    });
  }, [query.data?.profile]);

  const sequences = query.data?.sequences;
  useEffect(() => {
    if (selectedId !== null || !sequences) return;
    setSelectedId(sequences.length ? String(sequences[0].id) : "new");
  }, [sequences, selectedId]);

  const selected = useMemo(
    () => sequences?.find((sequence) => String(sequence.id) === selectedId),
    [sequences, selectedId],
  );
  // Recarrega o rascunho só quando muda QUAL sequência está aberta — um refetch
  // da lista não apaga o que está sendo digitado.
  useEffect(() => {
    if (selectedId === null || loadedId.current === selectedId) return;
    if (selectedId !== "new" && !selected) return;
    setDraft(selected ? sequenceToDraft(selected) : emptySequenceDraft());
    loadedId.current = selectedId;
  }, [selectedId, selected]);

  const isNew = !draft.id;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["outreach-settings"] });
  const saveSequence = useMutation({
    mutationFn: () => invokeOutreach({
      action: "upsert-sequence",
      sequence: { ...draft, steps: undefined },
      steps: draft.steps,
    }),
    onSuccess: async (data) => {
      const id = String(data.sequence.id);
      // A tela passa a mostrar o que o servidor gravou, não o que foi digitado.
      setDraft(sequenceToDraft(data.sequence));
      loadedId.current = id;
      setSelectedId(id);
      await refresh();
      toast.success(isNew ? "Sequência criada." : "Alterações salvas.");
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
  // SE-REV-005 — a mensagem de abertura tinha configuração no banco e nenhuma
  // tela. Grava pelo mesmo caminho que a função de abertura lê.
  const saveOpener = useMutation({
    mutationFn: () => invokeFunction("start-conversation", {
      action: "update-settings",
      enabled: opener?.enabled === true,
      first_message: opener?.first_message ?? "",
      trigger_entry_ids: opener?.trigger_entry_ids ?? [],
    }),
    onSuccess: async () => {
      await refresh();
      toast.success("Mensagem de abertura salva.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });
  // SE-REV-005 — apagar sequência. O servidor desliga, cancela inscrições e
  // envios pendentes e só então apaga (ver outreach/index.ts, delete-sequence).
  const deleteSequence = useMutation({
    mutationFn: (sequenceId: string) => invokeOutreach({ action: "delete-sequence", sequence_id: sequenceId }),
    onSuccess: async (data) => {
      await refresh();
      loadedId.current = null;
      setSelectedId(null);
      toast.success(`Sequência "${String(data?.name ?? "")}" apagada.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível apagar."),
  });

  if (query.error) {
    return <div className="container mx-auto p-6 text-destructive">Falha ao carregar: {query.error.message}</div>;
  }
  if (query.isLoading || !profile || !opener || selectedId === null) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const lineValue = profile.provider === "gptmaker" ? profile.channel_id : profile.solo_instance_id;
  const canSaveSequence = Boolean(
    draft.name.trim() && draft.trigger_entry_ids.length === 1 &&
      draft.steps.every((step) => step.message_template.trim() && templateProblems(step.message_template).length === 0),
  );
  const entries = query.data.entries;
  const hiddenEntries = query.data.hidden_entries ?? [];
  const tenantName = query.data.tenant_name || "Sua empresa";
  const knownEntry = (id: string) => entries.find((entry) => entry.id === id);
  const hiddenNote = hiddenEntries.length > 0 && (
    <p className="text-xs text-muted-foreground" data-testid="hidden-entries">
      Fora da lista por não receberem lead: {hiddenEntries.map((entry) => `${entry.name} (${HIDDEN_REASON[entry.reason] ?? entry.reason})`).join("; ")}.
    </p>
  );
  const openerProblems = templateProblems(opener.first_message);
  const openerMissing = opener.enabled && (!opener.first_message.trim() || opener.trigger_entry_ids.length === 0);
  // Uma sequência ligada na mesma porta manda no lugar da abertura
  // (dispatchConversationOpen cede a vez para a cadência).
  const openerOverlaps = query.data.sequences.filter((sequence) =>
    sequence.active === true && Array.isArray(sequence.trigger_entry_ids) &&
    sequence.trigger_entry_ids.some((id) => opener.trigger_entry_ids.includes(String(id))));
  const activeEnrollments = Number((selected?.enrollment_counts as Record<string, number> | undefined)?.active ?? 0);

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
                <SelectItem value="gptmaker">Provedor de IA (WhatsApp não oficial)</SelectItem>
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
              <p className="text-xs text-amber-600">Canais do provedor de IA indisponíveis: {query.data.gpt_channels_error}</p>
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

      <Card data-testid="opener-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Mensagem de abertura</CardTitle>
              <CardDescription>
                Enviada pelo canal acima quando um lead entra por uma das portas marcadas. Ela aparece no chat e, quando o cliente responde, o agente continua o atendimento.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2"><Label htmlFor="opener-enabled">Ativa</Label><Switch id="opener-enabled" checked={opener.enabled} onCheckedChange={(enabled) => setOpener({ ...opener, enabled })} /></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            <Label>Portas que disparam</Label>
            {entries.map((entry) => (
              <label key={entry.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={opener.trigger_entry_ids.includes(entry.id)}
                  onCheckedChange={(checked) => setOpener({
                    ...opener,
                    trigger_entry_ids: checked
                      ? [...opener.trigger_entry_ids, entry.id]
                      : opener.trigger_entry_ids.filter((id) => id !== entry.id),
                  })}
                />
                {entryLabel(entry)}
              </label>
            ))}
            {opener.trigger_entry_ids.filter((id) => !knownEntry(id)).map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm text-amber-700">
                <Checkbox checked onCheckedChange={() => setOpener({ ...opener, trigger_entry_ids: opener.trigger_entry_ids.filter((current) => current !== id) })} />
                Porta indisponível ({hiddenEntries.find((entry) => entry.id === id)?.name ?? id.slice(0, 8)}) — desmarque
              </label>
            ))}
            {hiddenNote}
          </div>
          <div className="space-y-3">
            <Label htmlFor="opener-message">Texto</Label>
            <MessageTemplateField
              id="opener-message"
              rows={3}
              value={opener.first_message}
              tenantName={tenantName}
              placeholder="Oi {{lead.first_name}}! Aqui é da {{tenant.name}}. Vi que você se cadastrou — posso te ajudar?"
              onChange={(first_message) => setOpener({ ...opener, first_message })}
            />
            <p className="text-xs text-muted-foreground">
              Não é enviada para quem já mandou mensagem nas últimas 24 h: esse lead já está em atendimento com o agente.
            </p>
            {openerOverlaps.map((sequence) => (
              <p key={String(sequence.id)} className="flex items-start gap-1 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                A sequência ativa “{String(sequence.name)}” usa uma destas portas e envia no lugar desta mensagem.
              </p>
            ))}
            {openerMissing && <p className="text-xs text-destructive">Para ativar, escreva o texto e marque ao menos uma porta.</p>}
            <div className="flex justify-end">
              <Button onClick={() => saveOpener.mutate()} disabled={saveOpener.isPending || openerProblems.length > 0 || openerMissing}>
                {saveOpener.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar mensagem de abertura
              </Button>
            </div>
          </div>
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
              <div><CardTitle>{isNew ? "Nova sequência" : `Editando: ${String(selected?.name ?? draft.name)}`}</CardTitle><CardDescription>{isNew ? "Salvar cria uma sequência nova." : "Salvar altera esta sequência."} Somente o evento de entrada pela porta escolhida é configurado aqui.</CardDescription></div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Label htmlFor="sequence-active">Ativa</Label><Switch id="sequence-active" checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} /></div>
                {!isNew && draft.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive" disabled={deleteSequence.isPending}>
                        {deleteSequence.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Apagar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar a sequência “{String(selected?.name ?? draft.name)}”?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-2">
                            <p>
                              {activeEnrollments > 0
                                ? `${activeEnrollments} lead(s) ainda têm mensagens desta sequência para receber. Esses envios são cancelados — nada mais sai para eles.`
                                : "Nenhum lead tem envio pendente nesta sequência."}
                            </p>
                            <p>As mensagens já enviadas continuam no chat. Não dá para desfazer.</p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => draft.id && deleteSequence.mutate(draft.id)}>Apagar sequência</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Nome</Label><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
              <div className="space-y-2">
                <Label>Porta de entrada</Label>
                <Select value={draft.trigger_entry_ids[0] ?? "none"} onValueChange={(value) => setDraft({ ...draft, trigger_entry_ids: value === "none" ? [] : [value] })}>
                  <SelectTrigger><SelectValue placeholder="Escolha a porta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione uma porta</SelectItem>
                    {entries.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entryLabel(entry)}</SelectItem>)}
                    {draft.trigger_entry_ids[0] && !knownEntry(draft.trigger_entry_ids[0]) && (
                      <SelectItem value={draft.trigger_entry_ids[0]} disabled>Porta indisponível — escolha outra</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {hiddenNote}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="font-medium">Mensagens</h3><p className="text-sm text-muted-foreground">O offset é contado desde a entrada do lead.</p></div><Button variant="outline" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { position: draft.steps.length, offset_minutes: (draft.steps.at(-1)?.offset_minutes ?? 0) + 1440, message_template: "" }] })}><Plus className="mr-2 h-4 w-4" />Mensagem</Button></div>
              {draft.steps.map((step, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 font-medium"><Clock3 className="h-4 w-4" />Passo {index + 1}</div>{draft.steps.length > 1 && <Button size="icon" variant="ghost" aria-label={`Remover passo ${index + 1}`} onClick={() => setDraft({ ...draft, steps: reindexSteps(draft.steps.filter((_, position) => position !== index)) })}><Trash2 className="h-4 w-4" /></Button>}</div>
                  <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <div className="space-y-2"><Label>Offset (minutos)</Label><Input type="number" min={0} value={step.offset_minutes} onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((current, position) => position === index ? { ...current, offset_minutes: Number(event.target.value) } : current) })} /></div>
                    <div className="space-y-2"><Label htmlFor={`step-${index}-message`}>Texto</Label><MessageTemplateField id={`step-${index}-message`} value={step.message_template} tenantName={tenantName} placeholder="Oi {{lead.first_name}}, aqui é da {{tenant.name}}…" onChange={(message_template) => setDraft({ ...draft, steps: draft.steps.map((current, position) => position === index ? { ...current, message_template } : current) })} /></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end"><Button disabled={!canSaveSequence || saveSequence.isPending} onClick={() => saveSequence.mutate()}>{saveSequence.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{isNew ? "Criar sequência" : "Salvar alterações"}</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
