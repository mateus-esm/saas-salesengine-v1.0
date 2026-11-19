import { useState } from "react";
import { WhatsAppComposer } from "./WhatsAppComposer";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import type { WebhookConfig } from "@/types/webhook";

type Instance = { id: string; display_name: string; instance_name: string; status: string };
const fields = [
  ["name","Cliente","Maria Souza"], ["telefone","Telefone","+55 85 90000-0000"],
  ["mensagem.preco","Preço da venda","R$ 14.000,00"], ["mensagem.produto","Produto vendido","Gerador Solar"],
  ["mensagem.canal","Canal de aquisição","Direto / Marca"], ["mensagem.canal_contato","Canal de contato","WhatsApp"],
  ["responsavel.name","Responsável","Ana Silva"], ["estagio","Etapa","Ganho"],
  ["mensagem.email_responsavel","E-mail do responsável","ana@example.com"],
  ["mensagem.telefone_responsavel","WhatsApp do responsável","+55 85 90000-0001"],
  ["mensagem.sla","SLA da etapa","24 h"], ["mensagem.touchpoints","Total de touchpoints do lead","3"],
  ["mensagem.ultimo_touchpoint","Data do último touchpoint","18/11/2026"],
  ["pipeline.name","Pipeline","Vendas"], ["fonte","Fonte","Landing page"],
  ["valor_da_oportunidade","Valor do negócio","14000"], ["data_de_fechamento","Fechamento","2026-11-19"],
];
const variables = fields.map(([key,label]) => ({key:"payload.data."+key,label}));
const samples = Object.fromEntries(fields.map(([key,,value]) => ["payload.data."+key,value]));
export function OutreachEvents({ instances }: { instances: Instance[] }) {
  const { configs, createConfig, updateConfig } = useWebhookConfigs();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [instance, setInstance] = useState("");
  const [team, setTeam] = useState(false);
  const [lead, setLead] = useState(false);
  const [phones, setPhones] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(true);
  const {hasRole} = useRole();
  const [salePreview,setSalePreview] = useState<{source:string; event:string|null; text:string}|null>(null);
  const realPreview = salePreview?.source === message && salePreview.event === editing ? salePreview : null;
  async function previewSale() {
    const {data,error} = await (supabase as any).rpc("preview_outreach_win",{event_id:editing==="new"?null:editing,message});
    if (error) return toast.error(error.message);
    setSalePreview({source:message,event:editing,text:data ?? ""});
  }
  const events = configs.filter(c => c.trigger_event === "outreach_event:" + c.id);
  function edit(c?: WebhookConfig) {
    setSalePreview(null);
    setEditing(c?.id ?? "new"); setName(c?.name ?? "");
    setInstance(c?.url.split("/").pop() ?? instances.find(i => i.status === "connected")?.id ?? "");
    setTeam(c?.outreach_recipients?.team ?? false); setLead(c?.outreach_recipients?.lead ?? false);
    setPhones(c?.outreach_recipients?.phones.join("\n") ?? "");
    setMessage(String(c?.payload_template.text ?? "")); setActive(c?.active ?? true);
  }
  async function save() {
    const numbers = [...new Set(phones.split(/[\n,;|]/).map(n => n.trim()).filter(Boolean).map(n => n.replace(/[()\s+-]/g, "")))];
    if (numbers.some(n => !/^\d{10,15}$/.test(n))) return toast.error("Informe DDI, DDD e número em cada linha.");
    if (!(team || lead || numbers.length)) return toast.error("Escolha pelo menos um destinatário.");
    const id = editing === "new" ? crypto.randomUUID() : editing!;
    const data = { id, name: name.trim(), active, url: "rev://whatsapp/" + instance, trigger_event: "outreach_event:" + id,
      payload_template: { number: "{{recipient}}", text: message.trim() }, outreach_recipients: { team, lead, phones: numbers } };
    try {
      if (editing === "new") await createConfig.mutateAsync(data);
      else await updateConfig.mutateAsync(data);
      setEditing(null);
    } catch { /* mutation shows the error */ }
  }
  return <Card><CardHeader><CardTitle>Eventos de WhatsApp</CardTitle></CardHeader><CardContent className="space-y-3">
    {events.map(c => <div key={c.id} className="flex items-center justify-between"><span>{c.name} · {c.active ? "Ativo" : "Desativado"}</span><Button variant="outline" onClick={() => edit(c)}>Editar</Button></div>)}
    {editing === null ? <Button onClick={() => edit()}>Novo evento de WhatsApp</Button> :
      <div className="space-y-3">
        <label className="block">Nome do evento<Input value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block">Instância remetente<select className="block w-full rounded border p-2" value={instance} onChange={e => setInstance(e.target.value)}><option value="">Selecione</option>{instances.map(i => <option value={i.id} key={i.id}>{i.display_name || i.instance_name} · {i.status}</option>)}</select></label>
        <fieldset className="space-y-2"><legend>Destinatários</legend>
          <label className="block"><input type="checkbox" checked={team} onChange={e => setTeam(e.target.checked)} /> Equipe com telefone cadastrado</label>
          <label className="block"><input type="checkbox" checked={lead} onChange={e => setLead(e.target.checked)} /> Cliente do negócio</label>
          <label className="block">Outros números com DDI (um por linha)<Textarea value={phones} onChange={e => setPhones(e.target.value)} /></label>
        </fieldset>
        <label htmlFor="outreach-event-message">Mensagem</label>
        <WhatsAppComposer id="outreach-event-message" value={message} onChange={setMessage} variables={variables}
          previewLabel={realPreview ? "Prévia no WhatsApp · Venda ganha" : "Prévia no WhatsApp · Dados de exemplo"}
          preview={realPreview?.text ?? message.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_token,key) => samples[key] ?? "⟨campo do CRM⟩")} />
        {hasRole("admin") && <Button type="button" variant="outline" disabled={!message.trim()} onClick={previewSale}>Prévia com uma venda ganha</Button>}
        <label className="block"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Evento ativo</label>
        <Button disabled={!name.trim() || !message.trim() || !instance || createConfig.isPending || updateConfig.isPending} onClick={save}>Salvar evento</Button>{" "}
        <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
      </div>}
  </CardContent></Card>;
}
