import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useWebhookConfigs } from "@/hooks/useWebhookConfigs";
import { useButtonWebhooks, useTeamStages } from "@/hooks/useAutomations";
import { supabase } from "@/integrations/supabase/client";

type Workflow = { id: string; name: string; description: string; event: "stage_entered" | "button_clicked"; trigger_id: string; action_ids: string[]; enabled: boolean };
const selectStyle = "block w-full rounded border bg-background p-2";
export function WorkflowList() {
  const { profile } = useAuth();
  const team = profile?.equipe_id;
  const { stages } = useTeamStages();
  const buttons = useButtonWebhooks();
  const { configs } = useWebhookConfigs();
  const actions = configs.filter(c => !c.inbound_function && ["stage_entered:", "automation:", "outreach_event:"].some(prefix => c.trigger_event === prefix + c.id));
  const actionName = (id: string) => actions.find(c => c.id === id)?.name ?? "Ação indisponível";
  const queryClient = useQueryClient();
  const key = ["crm-workflows", team];
  const db = supabase as any;
  const list = useQuery({ queryKey: key, enabled: !!team, queryFn: async (): Promise<Workflow[]> => {
    const { data, error } = await db.from("crm_workflows").select("*").eq("equipe_id", team).order("name");
    if (error) throw error;
    return data;
  } });
  const [draft, setDraft] = useState<Workflow | null>(null);
  const patch = (value: Partial<Workflow>) => setDraft(d => d && ({ ...d, ...value }));
  const save = useMutation({ mutationFn: async (row: Workflow) => {
    const { error } = await db.from("crm_workflows").upsert({ ...row, name: row.name.trim(), equipe_id: team });
    if (error) throw error;
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: key }); setDraft(null); toast.success("Fluxo salvo"); },
  onError: (e: Error) => toast.error(e.message) });
  const options = (event: Workflow["event"]) => event === "stage_entered"
    ? stages.map(s => ({ id: s.id, name: [s.pipeline_name, s.name].filter(Boolean).join(" → ") }))
    : buttons.map(b => ({ id: b.trigger_event.slice("artifact_action:".length), name: b.name }));
  return <Card className="mb-4"><CardHeader><CardTitle>Fluxos de automação</CardTitle></CardHeader><CardContent className="space-y-4">
    {list.isError && <p role="alert">Falha ao carregar os fluxos.</p>}
    {list.data?.map(w => <section key={w.id} className="rounded border p-3">
      <div className="flex justify-between gap-2"><strong>{w.name}</strong><Button size="sm" variant="outline" onClick={() => setDraft(w)}>Editar fluxo</Button></div>
      {w.description && <p>{w.description}</p>}
      <p className="text-sm text-muted-foreground">{w.enabled ? "Ativo" : "Pausado"} · {w.event === "stage_entered" ? "Ao entrar na etapa" : "Ao clicar no botão"} · {options(w.event).find(o => o.id === w.trigger_id)?.name ?? "Indisponível"}</p>
      <ol className="list-decimal pl-5">{w.action_ids.map(id => <li key={id}>{actionName(id)}</li>)}</ol>
    </section>)}
    {!draft ? <Button onClick={() => setDraft({id: crypto.randomUUID(), name:"", description:"", event:"stage_entered",trigger_id:"", action_ids:[""], enabled:true})}>Novo fluxo</Button> :
      <div className="space-y-3"><label className="block">Nome do fluxo<Input value={draft.name} onChange={e => patch({name:e.target.value})} /></label>
        <label className="block">Descrição<Textarea value={draft.description} onChange={e => patch({description:e.target.value})} /></label>
        <label className="block">Quando<select className={selectStyle} value={draft.event} onChange={e => patch({event:e.target.value as Workflow["event"],trigger_id:""})}>
          <option value="stage_entered">Negócio entrar na etapa</option><option value="button_clicked">Clicar no botão do registro</option></select></label>
        <label className="block">{draft.event === "stage_entered" ? "Etapa" : "Botão"}<select className={selectStyle} value={draft.trigger_id} onChange={e => patch({trigger_id:e.target.value})}>
          <option value="">Selecione</option>{options(draft.event).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <fieldset className="space-y-2"><legend>Ações</legend>{draft.action_ids.map((id,i) => <div key={i} className="flex gap-2">
          <select aria-label={`Ação ${i+1}`} className={selectStyle} value={id} onChange={e => patch({action_ids:draft.action_ids.map((v,j) => i===j ? e.target.value : v)})}>
            <option value="">Selecione uma ação</option>{actions.map(c => <option key={c.id} value={c.id} disabled={c.id!==id && draft.action_ids.includes(c.id)}>{c.trigger_event.startsWith("outreach_event:") ? "Outreach" : "Webhook"} · {c.name}</option>)}</select>
          <Button variant="ghost" onClick={() => patch({action_ids:draft.action_ids.filter((_,j) => i!==j)})}>Remover</Button></div>)}
          <Button variant="outline" onClick={() => patch({action_ids:[...draft.action_ids,""]})}>Adicionar ação</Button>{" "}
          <Link className="underline" to="/outreach" target="_blank">Gerenciar eventos no Outreach</Link>
        </fieldset>
        <label className="block"><input type="checkbox" checked={draft.enabled} onChange={e => patch({enabled:e.target.checked})} /> Fluxo ativo</label>
        <Button disabled={save.isPending || !draft.name.trim() || !draft.trigger_id || !draft.action_ids.length || draft.action_ids.includes("")} onClick={() => save.mutate(draft)}>Salvar fluxo</Button>{" "}
        <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
      </div>}
  </CardContent></Card>;
}
