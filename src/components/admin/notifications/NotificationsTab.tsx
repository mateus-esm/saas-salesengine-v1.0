import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, MessageSquare, Bell, Send, KeyRound, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PURPOSE_HINT: Record<string, string> = {
  comercial:  "Proposta enviada, follow-up, boas-vindas.",
  financeiro: "Fatura emitida, vencendo, vencida, pagamento confirmado.",
  suporte:    "Tickets e respostas de atendimento.",
  operacao:   "Crédito acabando, agente pausado, instância caiu.",
};

const CHANNEL_LABEL: Record<string, string> = {
  in_app: "No app", email: "E-mail", whatsapp: "WhatsApp",
};

interface Sender {
  purpose: string; label: string; description: string | null;
  whatsapp_instance: string | null; email_from: string | null; active: boolean;
}
interface NotifType {
  type: string; description: string | null; purpose: string;
  default_severity: string; default_channels: string[];
  template_title: string | null; template_body: string | null; variables: string[];
  /** Sprint 8.5: false = emitido por codigo e nao pode ser apagado. */
  custom: boolean;
}
interface MatrixRow {
  equipe_id: string; equipe_nome: string; type: string; description: string | null;
  purpose: string; enabled: boolean; channels: string[]; auto: boolean;
  phone_override: string | null; email_override: string | null;
}

/**
 * Sprint 8.4 (Fixes 2, item 11) — the notification switchboard.
 *
 * Three questions, three panels, in the order they get asked:
 *   1. Who is speaking?  (which Solo line carries which kind of message)
 *   2. What do we say?   (the wording, editable without a deploy)
 *   3. Who hears it?     (per client, per type)
 */
export function NotificationsTab() {
  return (
    <Tabs defaultValue="remetentes">
      <TabsList>
        <TabsTrigger value="remetentes" className="gap-2">
          <MessageSquare className="h-4 w-4" /> Remetentes
        </TabsTrigger>
        <TabsTrigger value="templates" className="gap-2">
          <Bell className="h-4 w-4" /> Mensagens
        </TabsTrigger>
        <TabsTrigger value="clientes" className="gap-2">
          <Send className="h-4 w-4" /> Por cliente
        </TabsTrigger>
      </TabsList>

      <TabsContent value="remetentes" className="mt-4 space-y-4">
        <SendersPanel />
        <SettingsPanel />
      </TabsContent>
      <TabsContent value="templates" className="mt-4"><TemplatesPanel /></TabsContent>
      <TabsContent value="clientes" className="mt-4"><ClientsPanel /></TabsContent>
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────── 1. Remetentes ──

function SendersPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testing, setTesting] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: senders, isLoading } = useQuery({
    queryKey: ["notification-senders"],
    queryFn: async (): Promise<Sender[]> => {
      const { data, error } = await supabase
        .from("notification_senders").select("*").order("purpose");
      if (error) throw error;
      return (data ?? []) as Sender[];
    },
  });

  const { data: instances } = useQuery({
    queryKey: ["wpp-instances-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wpp_instances").select("instance_name, display_name, status").order("display_name");
      return data ?? [];
    },
  });

  const save = async (purpose: string, patch: Record<string, unknown>) => {
    setBusy(purpose);
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", {
        body: { action: "save_sender", purpose, ...patch },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      toast({ title: "Remetente salvo" });
      qc.invalidateQueries({ queryKey: ["notification-senders"] });
    } catch (e) {
      toast({ title: "Não salvou", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const runTest = async (purpose: string) => {
    setBusy(purpose);
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", {
        body: { action: "test_send", purpose, phone: testPhone },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falhou");
      toast({ title: "Mensagem de teste enviada", description: `Instância ${data.instance}` });
      setTesting(null);
    } catch (e) {
      toast({ title: "Teste falhou", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem fala por cada assunto</CardTitle>
        <CardDescription>
          Cada finalidade sai por uma linha do WhatsApp. É o que permite o cliente distinguir uma
          cobrança de um follow-up de venda — e você saber por onde ele respondeu. Sem instância
          definida, a finalidade cai na instância padrão da plataforma; se não houver nenhuma, o
          WhatsApp é pulado e as cópias por e-mail e no app seguem normalmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(senders ?? []).map((s) => (
          <div key={s.purpose} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-xs text-muted-foreground">{PURPOSE_HINT[s.purpose] ?? s.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-xs text-muted-foreground">Ativo</Label>
                <Switch
                  checked={s.active}
                  disabled={busy === s.purpose}
                  onCheckedChange={(v) => save(s.purpose, { active: v })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Instância do WhatsApp</Label>
                <Select
                  value={s.whatsapp_instance ?? "__none__"}
                  onValueChange={(v) => save(s.purpose, { instance: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Padrão da plataforma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Padrão da plataforma</SelectItem>
                    {(instances ?? []).map((i) => (
                      <SelectItem key={i.instance_name as string} value={i.instance_name as string}>
                        {i.display_name as string} · {i.status as string}
                      </SelectItem>
                    ))}
                    {s.whatsapp_instance
                      && !(instances ?? []).some((i) => i.instance_name === s.whatsapp_instance) && (
                      <SelectItem value={s.whatsapp_instance}>
                        {s.whatsapp_instance} (externa)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <InstanceByName
                  current={s.whatsapp_instance}
                  onSave={(name) => save(s.purpose, { instance: name })}
                  disabled={busy === s.purpose}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Remetente de e-mail</Label>
                <Input
                  defaultValue={s.email_from ?? ""}
                  placeholder="financeiro@soloventures.com.br"
                  onBlur={(e) => e.target.value !== (s.email_from ?? "") && save(s.purpose, { email: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  O domínio precisa estar verificado na Resend, senão o envio volta como recusado.
                </p>
              </div>
            </div>

            <Button size="sm" variant="outline" onClick={() => setTesting(s.purpose)}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar teste
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={testing !== null} onOpenChange={(o) => !o && setTesting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Testar a linha</DialogTitle>
            <DialogDescription>
              Manda uma mensagem de verdade pela instância desta finalidade. Não grava nada no
              histórico de notificações — teste não é algo que o cliente foi avisado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Número com DDD</Label>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="11999998888" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTesting(null)}>Cancelar</Button>
            <Button onClick={() => testing && runTest(testing)} disabled={busy !== null}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** The founder's "ou colocando o nome da instância que eu já tenho conectada". */
function InstanceByName({
  current, onSave, disabled,
}: { current: string | null; onSave: (n: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current ?? "");

  if (!open) {
    return (
      <button
        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        ou digitar o nome de uma instância que já existe na VPS
      </button>
    );
  }
  return (
    <div className="flex gap-1.5">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="solo-financeiro" className="h-8" />
      <Button size="sm" className="h-8" disabled={disabled} onClick={() => { onSave(name); setOpen(false); }}>
        Usar
      </Button>
    </div>
  );
}

function SettingsPanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key, value, description");
      return data ?? [];
    },
  });

  const configured = (settings ?? []).find((s) => s.key === "RESEND_API_KEY")?.value;

  const save = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", {
        body: { action: "save_setting", key: "RESEND_API_KEY", value: resend },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      toast({ title: resend ? "Chave salva" : "Chave removida — volta a usar a variável de ambiente" });
      setResend("");
    } catch (e) {
      toast({ title: "Não salvou", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Chave da Resend
        </CardTitle>
        <CardDescription>
          Guardar a chave aqui é mais fraco do que deixá-la na variável de ambiente da plataforma —
          em troca, você a troca sem depender de um deploy. Só super admin lê esta tabela, e o valor
          nunca volta para a tela depois de salvo. Deixe em branco para voltar a usar a variável de
          ambiente.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">
            {configured ? "Uma chave está configurada aqui" : "Usando a variável de ambiente"}
          </Label>
          <Input
            type="password"
            value={resend}
            onChange={(e) => setResend(e.target.value)}
            placeholder={configured ? "••••••••  (digite para substituir)" : "re_..."}
          />
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────── 2. Mensagens ──

function TemplatesPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<NotifType | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("operacao");
  const [channels, setChannels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendTo, setSendTo] = useState<NotifType | null>(null);
  const [sendEquipe, setSendEquipe] = useState("");

  const { data: types, isLoading } = useQuery({
    queryKey: ["notification-types"],
    queryFn: async (): Promise<NotifType[]> => {
      const { data, error } = await supabase
        .from("notification_types").select("*").order("purpose").order("type");
      if (error) throw error;
      return (data ?? []) as NotifType[];
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["notification-teams"],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_admin_team_billing").select("equipe_id, nome").order("nome");
      return data ?? [];
    },
  });

  const open = (t: NotifType) => {
    setEditing(t);
    setTitle(t.template_title ?? "");
    setBody(t.template_body ?? "");
    setChannels(t.default_channels ?? []);
    setDescription(t.description ?? "");
    setPurpose(t.purpose);
  };

  const openNew = () => {
    setEditing("new");
    setTitle(""); setBody(""); setDescription("");
    setPurpose("operacao"); setChannels(["in_app"]);
  };

  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      toast({ title: ok });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["notification-types"] });
      return data;
    } catch (e) {
      toast({ title: "Não deu certo", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      return null;
    } finally { setBusy(false); }
  };

  const save = () => {
    if (editing === "new") {
      if (!description.trim()) {
        toast({ title: "Dê um nome ao modelo", variant: "destructive" });
        return;
      }
      return call({
        action: "create_template", description, purpose, channels, title, body,
      }, "Modelo criado");
    }
    if (!editing) return;
    return call({
      action: "save_template", type: editing.type, title, body, channels,
    }, title || body ? "Modelo salvo" : "Texto padrão restaurado");
  };

  const remove = () => {
    if (!editing || editing === "new") return;
    return call({ action: "delete_template", type: editing.type }, "Modelo apagado");
  };

  const sendNow = async () => {
    if (!sendTo || !sendEquipe) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", {
        body: { action: "send_template", type: sendTo.type, equipe_id: sendEquipe },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      if (data?.blocked) {
        toast({ title: "Bloqueado pelas regras deste cliente", description: data.message, variant: "destructive" });
        return;
      }
      type D = { channel: string; status: string; last_error: string | null };
      const all = (data?.deliveries ?? []) as D[];
      const sent = all.filter((d) => d.status === "sent");
      const failed = all.filter((d) => d.status !== "sent");
      toast({
        title: sent.length
          ? `Enviado por ${sent.map((d) => CHANNEL_LABEL[d.channel] ?? d.channel).join(" e ")}`
          : "Não saiu por nenhum canal",
        description: failed.length
          ? `Falhou em ${failed.map((d) => CHANNEL_LABEL[d.channel] ?? d.channel).join(", ")}: `
            + (failed[0].last_error ?? "motivo não informado")
          : undefined,
        variant: sent.length ? undefined : "destructive",
      });
      setSendTo(null);
    } catch (e) {
      toast({ title: "Não deu certo", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const toggle = (ch: string) =>
    setChannels((c) => c.includes(ch) ? c.filter((x) => x !== ch) : [...c, ch]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const isNew = editing === "new";
  const current = editing !== "new" ? editing : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">O que a plataforma diz</CardTitle>
          <CardDescription>
            O texto escrito aqui substitui o que o sistema mandaria. Os canais decidem por onde sai —
            deixar nenhum marcado registra a notificação e não entrega, que é como se silencia um
            aviso do sistema sem apagá-lo. Use <code>{"{{variavel}}"}</code> para encaixar dados;
            variável que não existir some do texto.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openNew} className="shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo modelo
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {(types ?? []).map((t) => (
            <div key={t.type} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => open(t)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{t.description ?? t.type}</span>
                  <Badge variant="outline" className="text-[10px]">{t.purpose}</Badge>
                  {t.custom
                    ? <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-700 dark:text-violet-300">manual</Badge>
                    : null}
                  {t.template_title
                    ? <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-300">personalizada</Badge>
                    : <Badge variant="outline" className="text-[10px] text-muted-foreground">padrão</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{t.type}</p>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {(t.default_channels ?? []).length === 0
                  ? <Badge variant="outline" className="text-[10px] text-muted-foreground">silenciada</Badge>
                  : (t.default_channels ?? []).map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px]">{CHANNEL_LABEL[c] ?? c}</Badge>
                    ))}
                <Button size="sm" variant="ghost" title="Enviar para um cliente agora"
                        onClick={() => { setSendTo(t); setSendEquipe(""); }}>
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo modelo" : (current?.description ?? current?.type)}</DialogTitle>
            <DialogDescription>
              {isNew
                ? "Um modelo criado aqui não é disparado por nada automaticamente — ele existe para você enviar à mão para um cliente."
                : "Deixe título e mensagem vazios para voltar ao texto padrão do sistema."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isNew && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)}
                         placeholder="Aviso de manutenção" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Finalidade</Label>
                  <Select value={purpose} onValueChange={setPurpose}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="suporte">Suporte</SelectItem>
                      <SelectItem value="operacao">Operação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Canais</Label>
              <div className="flex flex-wrap gap-1.5">
                {["in_app", "email", "whatsapp"].map((ch) => (
                  <button
                    key={ch}
                    onClick={() => toggle(ch)}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      channels.includes(ch)
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    {CHANNEL_LABEL[ch]}
                  </button>
                ))}
              </div>
              {channels.length === 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Sem canal: a notificação fica registrada e ninguém é avisado.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sua fatura venceu" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
            </div>

            {!!current?.variables?.length && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium mb-1.5">Variáveis deste tipo</p>
                <div className="flex flex-wrap gap-1.5">
                  {current.variables.map((v) => (
                    <button
                      key={v}
                      className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-background border border-border hover:border-foreground"
                      onClick={() => setBody((b) => `${b}{{${v}}}`)}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {current?.custom && (
                <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Apagar
                </Button>
              )}
              {current && !current.custom && (
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  Modelo do sistema: há código que o dispara, então não pode ser apagado. Para
                  silenciá-lo, desmarque todos os canais.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button>
              <Button onClick={save} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isNew ? "Criar" : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendTo !== null} onOpenChange={(o) => !o && setSendTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar “{sendTo?.description ?? sendTo?.type}” agora</DialogTitle>
            <DialogDescription>
              Manda esta mensagem para um cliente na hora, pelos canais do modelo. As regras do
              cliente continuam valendo: se ele estiver com este aviso desligado, nada sai.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente</Label>
            <Select value={sendEquipe} onValueChange={setSendEquipe}>
              <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
              <SelectContent>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.equipe_id as string} value={t.equipe_id as string}>
                    {t.nome as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTo(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={sendNow} disabled={busy || !sendEquipe}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── 3. Clientes ──

function ClientsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [equipe, setEquipe] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["notification-matrix"],
    queryFn: async (): Promise<MatrixRow[]> => {
      const { data, error } = await supabase
        .from("v_admin_notification_matrix").select("*").order("equipe_nome").order("type");
      if (error) throw error;
      return (data ?? []) as MatrixRow[];
    },
  });

  const teams = [...new Map((rows ?? []).map((r) => [r.equipe_id, r.equipe_nome])).entries()];
  const current = equipe || teams[0]?.[0] || "";
  const visible = (rows ?? []).filter((r) => r.equipe_id === current);

  const save = async (row: MatrixRow, patch: Record<string, unknown>) => {
    setBusy(row.type);
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", {
        body: { action: "save_policy", equipe_id: row.equipe_id, type: row.type, ...patch },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message ?? data.error);
      qc.invalidateQueries({ queryKey: ["notification-matrix"] });
    } catch (e) {
      toast({ title: "Não salvou", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const toggleChannel = (row: MatrixRow, ch: string) => {
    const next = row.channels.includes(ch)
      ? row.channels.filter((c) => c !== ch)
      : [...row.channels, ch];
    save(row, { channels: next });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem recebe o quê</CardTitle>
        <CardDescription>
          Vale por cliente e por tipo. Desligado, a notificação não é sequer criada para ele. Os
          canais aqui só podem <strong>reduzir</strong> o que o tipo já prevê — e o cliente ainda
          pode se silenciar mais nas preferências dele, nunca ao contrário. "Automático" desligado
          prepara a mensagem sem enviar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={current} onValueChange={setEquipe}>
          <SelectTrigger className="w-[280px]"><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
          <SelectContent>
            {teams.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="divide-y divide-border rounded-lg border border-border">
          {visible.map((r) => (
            <div key={r.type} className="px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.description ?? r.type}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{r.type}</p>
                </div>
                {busy === r.type && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Label className="text-[11px] text-muted-foreground">Envia</Label>
                  <Switch checked={r.enabled} onCheckedChange={(v) => save(r, { enabled: v })} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Label className="text-[11px] text-muted-foreground">Auto</Label>
                  <Switch checked={r.auto} onCheckedChange={(v) => save(r, { auto: v })} />
                </div>
              </div>

              {r.enabled && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {["in_app", "email", "whatsapp"].map((ch) => {
                    const on = r.channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        onClick={() => toggleChannel(r, ch)}
                        disabled={busy === r.type}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                          on
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                      >
                        {CHANNEL_LABEL[ch]}
                      </button>
                    );
                  })}
                  {r.channels.includes("whatsapp") && (
                    <Input
                      defaultValue={r.phone_override ?? ""}
                      placeholder="número específico (opcional)"
                      className="h-7 w-52 text-xs"
                      onBlur={(e) =>
                        e.target.value !== (r.phone_override ?? "") &&
                        save(r, { phone_override: e.target.value })}
                    />
                  )}
                  {r.channels.includes("email") && (
                    <Input
                      defaultValue={r.email_override ?? ""}
                      placeholder="e-mail específico (opcional)"
                      className="h-7 w-56 text-xs"
                      onBlur={(e) =>
                        e.target.value !== (r.email_override ?? "") &&
                        save(r, { email_override: e.target.value })}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
