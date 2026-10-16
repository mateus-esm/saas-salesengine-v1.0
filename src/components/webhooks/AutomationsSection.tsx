import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAutomations, useTeamStages, type AutomationAction, type AutomationTrigger, type CrmAutomation } from "@/hooks/useAutomations";
import { lossReasonMissing } from "@/lib/webhookCatalog";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";

const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  move_stage: "Mover para etapa",
  update_field: "Atualizar campo",
  set_responsible: "Atribuir responsável",
  call_webhook: "Chamar webhook",
};

/** Uma frase para a regra: "Ao entrar na etapa X → Mover para etapa Y". */
function describe(a: CrmAutomation, stageName: (id?: string) => string, webhookName: (id?: string) => string, memberName: (id?: string) => string) {
  const when = a.trigger.event === "stage_entered"
    ? `Ao entrar na etapa ${stageName(a.trigger.stage_id)}`
    : a.trigger.event === "webhook_received"
      ? `Ao receber o webhook ${webhookName(a.trigger.webhook_id)}`
      : "Ao clicar no botão";
  const p = a.action.params;
  const what = {
    move_stage: `${ACTION_LABELS.move_stage} ${stageName(p.stage_id as string)}`,
    update_field: `${ACTION_LABELS.update_field} ${String(p.field ?? "")} = ${p.from_payload ? `payload.${p.from_payload}` : JSON.stringify(p.value)}`,
    set_responsible: `${ACTION_LABELS.set_responsible} ${memberName(p.user_id as string)}`,
    call_webhook: `${ACTION_LABELS.call_webhook} ${webhookName(p.webhook_id as string)}`,
  }[a.action.type];
  return `${when} → ${what}`;
}

export const AutomationsSection = () => {
  const { automations, create, toggle, remove } = useAutomations();
  const { stages } = useTeamStages();
  const { configs } = useWebhookConfigs();
  const { members, nameOf } = useMemberDirectory();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [event, setEvent] = useState<AutomationTrigger["event"]>("stage_entered");
  const [triggerStage, setTriggerStage] = useState("");
  const [triggerWebhook, setTriggerWebhook] = useState("");
  const [type, setType] = useState<AutomationAction["type"]>("move_stage");
  const [targetStage, setTargetStage] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [field, setField] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [user, setUser] = useState("");
  const [callWebhook, setCallWebhook] = useState("");

  const stageName = (id?: string) => {
    const s = stages.find((x) => x.id === id);
    return s ? `${s.name}${s.pipeline_name ? ` (${s.pipeline_name})` : ""}` : "(removida)";
  };
  const webhookName = (id?: string) => configs.find((c) => c.id === id)?.name ?? "(removido)";
  const memberName = (id?: string) => nameOf(id) ?? "(removido)";

  const inbound = configs.filter((c) => c.inbound_function === "receive_lead");
  // Só webhooks de saída feitos para disparo por regra (ver crm_run_automation).
  const linkable = configs.filter((c) => !c.inbound_function && (c.trigger_event.startsWith("stage_entered:") || c.trigger_event.startsWith("automation:")));

  const trigger: AutomationTrigger | null =
    event === "stage_entered" ? (triggerStage ? { event, stage_id: triggerStage } : null)
      : triggerWebhook ? { event, webhook_id: triggerWebhook } : null;
  const action: AutomationAction | null =
    type === "move_stage" ? (targetStage ? { type, params: { stage_id: targetStage, ...(lostReason ? { lost_reason: lostReason } : {}) } } : null)
      : type === "update_field" ? (field.trim() ? { type, params: { field: field.trim(), value: fieldValue } } : null)
        : type === "set_responsible" ? (user ? { type, params: { user_id: user } } : null)
          : callWebhook ? { type, params: { webhook_id: callWebhook } } : null;
  const target = stages.find((s) => s.id === targetStage);
  const needsReason = type === "move_stage" && lossReasonMissing(target, lostReason);
  const valid = !!name.trim() && !!trigger && !!action && !needsReason;

  const submit = async () => {
    if (!trigger || !action) return;
    await create.mutateAsync({ name: name.trim(), trigger, action });
    setAdding(false);
    setName(""); setTriggerStage(""); setTriggerWebhook(""); setTargetStage(""); setField(""); setFieldValue(""); setUser(""); setCallWebhook("");
  };

  const pick = (value: string, set: (v: string) => void, options: Array<{ id: string; label: string }>, placeholder: string) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
  const stageOptions = stages.map((s) => ({ id: s.id, label: `${s.name}${s.pipeline_name ? ` · ${s.pipeline_name}` : ""}` }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Automações</CardTitle>
          <CardDescription>Quando algo acontece, o sistema age: mover a etapa, atualizar um campo, atribuir o responsável ou chamar um webhook.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4 mr-1" />Nova automação</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="border rounded-md p-4 space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ganho avisa o financeiro" /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Quando</Label>
                <Select value={event} onValueChange={(v) => setEvent(v as AutomationTrigger["event"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stage_entered">O negócio entrar na etapa</SelectItem>
                    <SelectItem value="webhook_received">Chegar um webhook de entrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{event === "stage_entered" ? "Etapa" : "Webhook de entrada"}</Label>
                {event === "stage_entered"
                  ? pick(triggerStage, setTriggerStage, stageOptions, "Escolha a etapa")
                  : pick(triggerWebhook, setTriggerWebhook, inbound.map((c) => ({ id: c.id, label: c.name })), "Escolha o webhook")}
              </div>
              <div className="space-y-1">
                <Label>Então</Label>
                <Select value={type} onValueChange={(v) => setType(v as AutomationAction["type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ACTION_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                {type === "move_stage" && (<><Label>Etapa de destino</Label>{pick(targetStage, (v) => { setTargetStage(v); setLostReason(""); }, stageOptions, "Escolha a etapa")}
                  {target?.stage_type === "lost" && (target.loss_reasons?.length ?? 0) > 0 && (<>
                    <Label>Motivo da perda (obrigatório neste pipeline)</Label>
                    {pick(lostReason, setLostReason, (target.loss_reasons ?? []).map((r) => ({ id: r, label: r })), "Escolha o motivo")}</>)}</>)}
                {type === "update_field" && (<><Label>Campo (key) e valor</Label><div className="flex gap-2">
                  <Input value={field} onChange={(e) => setField(e.target.value)} placeholder="key do campo" />
                  <Input value={fieldValue} onChange={(e) => setFieldValue(e.target.value)} placeholder="valor" /></div></>)}
                {type === "set_responsible" && (<><Label>Responsável</Label>{pick(user, setUser, members.map((m) => ({ id: m.id, label: m.name })), "Escolha a pessoa")}</>)}
                {type === "call_webhook" && (<><Label>Webhook de saída</Label>{pick(callWebhook, setCallWebhook, linkable.map((c) => ({ id: c.id, label: c.name })), linkable.length ? "Escolha o webhook" : "Nenhum webhook de etapa disponível")}</>)}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
              <Button disabled={!valid || create.isPending} onClick={submit}>Salvar</Button>
            </div>
          </div>
        )}
        {automations.length === 0 && !adding && <p className="text-sm text-muted-foreground">Nenhuma automação criada.</p>}
        {automations.map((a) => (
          <div key={a.id} className="flex items-center justify-between border rounded-md p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.name}</span>
                {a.enabled ? <Badge className="bg-green-600">Ativa</Badge> : <Badge variant="secondary">Desativada</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{describe(a, stageName, webhookName, memberName)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={a.enabled} onCheckedChange={() => toggle.mutate(a)} />
              <Button variant="ghost" size="icon" onClick={() => confirm("Excluir esta automação?") && remove.mutate(a.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
