import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeamStages } from "@/hooks/useAutomations";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import type { WebhookAction } from "@/types/webhook";
import { lossReasonMissing } from "@/lib/webhookCatalog";

const NONE = "none";

interface Props {
  value: WebhookAction | null | undefined;
  onChange: (next: WebhookAction | null) => void;
}

/**
 * Ação opcional de um webhook de entrada, executada sobre o negócio que o webhook
 * cria/atualiza (a mesma ação das Automações). Sem ação, o webhook só cria o lead.
 */
const omitLostReason = ({ lost_reason: _drop, ...rest }: Record<string, unknown>) => rest;

export const InboundActionEditor = ({ value, onChange }: Props) => {
  const { stages } = useTeamStages();
  const { members } = useMemberDirectory();
  const type = value?.type ?? NONE;
  const params = value?.params ?? {};
  const setParams = (patch: Record<string, unknown>) => value && onChange({ ...value, params: { ...params, ...patch } });

  return (
    <div className="space-y-2">
      <Label>Ação ao receber (opcional)</Label>
      <Select value={type} onValueChange={(v) => onChange(v === NONE ? null : { type: v as WebhookAction["type"], params: {} })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nenhuma (só cria/atualiza o lead)</SelectItem>
          <SelectItem value="move_stage">Mover o negócio para uma etapa</SelectItem>
          <SelectItem value="update_field">Atualizar um campo a partir do payload</SelectItem>
          <SelectItem value="set_responsible">Atribuir um responsável</SelectItem>
        </SelectContent>
      </Select>
      {type === "move_stage" && (
        <Select value={String(params.stage_id ?? "")} onValueChange={(v) => value && onChange({ ...value, params: { ...omitLostReason(params), stage_id: v } })}>
          <SelectTrigger><SelectValue placeholder="Etapa de destino" /></SelectTrigger>
          <SelectContent>
            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.pipeline_name ? ` · ${s.pipeline_name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {type === "move_stage" && (() => {
        const target = stages.find((s) => s.id === params.stage_id);
        if (target?.stage_type !== "lost" || (target.loss_reasons?.length ?? 0) === 0) return null;
        return (
          <Select value={String(params.lost_reason ?? "")} onValueChange={(v) => setParams({ lost_reason: v })}>
            <SelectTrigger className={lossReasonMissing(target, params.lost_reason) ? "border-destructive" : ""}>
              <SelectValue placeholder="Motivo da perda (obrigatório neste pipeline)" />
            </SelectTrigger>
            <SelectContent>{(target.loss_reasons ?? []).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        );
      })()}
      {type === "update_field" && (
        <div className="flex gap-2">
          <Input placeholder="key do campo do negócio" value={String(params.field ?? "")} onChange={(e) => setParams({ field: e.target.value })} />
          <Input placeholder="campo do payload (ex.: dados.kwh)" value={String(params.source ?? "")} onChange={(e) => setParams({ source: e.target.value })} />
        </div>
      )}
      {type === "set_responsible" && (
        <Select value={String(params.user_id ?? "")} onValueChange={(v) => setParams({ user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
};
