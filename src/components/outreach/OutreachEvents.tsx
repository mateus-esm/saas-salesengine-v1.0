import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import type { WebhookConfig } from "@/types/webhook";

type Instance = { id: string; display_name: string; instance_name: string; status: string };
const fields = ["name", "telefone", "valor_da_oportunidade", "estagio", "responsavel.name"];
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
  const events = configs.filter(c => c.trigger_event === "outreach_event:" + c.id);
  function edit(c?: WebhookConfig) {
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
        <label className="block">Mensagem<Textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} /></label>
        <div className="flex flex-wrap gap-2">{fields.map((field, i) => <Button key={field} size="sm" variant="outline" onClick={() => setMessage(m => m + "{{payload.data." + field + "}}")}>{["Cliente","Telefone","Valor","Etapa","Responsável"][i]}</Button>)}</div>
        <label className="block"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Evento ativo</label>
        <Button disabled={!name.trim() || !message.trim() || !instance || createConfig.isPending || updateConfig.isPending} onClick={save}>Salvar evento</Button>{" "}
        <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
      </div>}
  </CardContent></Card>;
}
