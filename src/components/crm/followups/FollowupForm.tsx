// Sprint 15b · T3 — o formulário de follow-up.
//
// Controlado (value/onChange). `mode="manual"` é o "Agendar follow-up" do
// negócio; `mode="recycle"` (usado pelo diálogo do Reciclo, T4) acrescenta o
// motivo, "Vai voltar?" e o que fazer quando a data chegar.

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_VARIABLES } from "@/lib/message-variables";
import type { FollowupFormValue } from "@/lib/followups";
import { UserPicker } from "../fields/UserPicker";

export interface FollowupFormProps {
  value: FollowupFormValue;
  onChange: (value: FollowupFormValue) => void;
  mode: "manual" | "recycle";
  /** Etapas do funil (modo recycle: destino de "Voltar para a etapa"). */
  stages?: { id: string; name: string }[];
  /** Motivos de Reciclo do funil (pipelines.recycle_reasons). */
  reasons?: string[];
  /** Há linha de WhatsApp configurada em Outreach? */
  hasLine: boolean;
  /** Nome da linha (instância Solo) para mostrar no canal. */
  lineLabel?: string | null;
  /** A consulta da linha falhou: o interruptor segue habilitado e a RPC decide. */
  lineError?: boolean;
  onRetryLine?: () => void;
  disabled?: boolean;
}

const OTHER = "__other__";

export function FollowupForm({
  value,
  onChange,
  mode,
  stages = [],
  reasons = [],
  hasLine,
  lineLabel,
  lineError = false,
  onRetryLine,
  disabled,
}: FollowupFormProps) {
  // Consulta falhou = linha desconhecida: não afirma que não há linha.
  const canSend = hasLine || lineError;
  const set = (patch: Partial<FollowupFormValue>) => onChange({ ...value, ...patch });
  const recycle = mode === "recycle";
  const willReturn = recycle ? value.willReturn !== false : true;
  const [otherReason, setOtherReason] = useState(() => value.reason !== "" && !reasons.includes(value.reason));
  const reasonSelect = otherReason ? OTHER : value.reason;
  const returns = value.returnStageId !== null;

  return (
    <div className="space-y-4">
      {recycle && (
        <div className="space-y-2">
          <Label htmlFor="followup-reason">Motivo</Label>
          <Select
            value={reasonSelect || undefined}
            onValueChange={(v) => {
              if (v === OTHER) {
                setOtherReason(true);
                set({ reason: "" });
              } else {
                setOtherReason(false);
                set({ reason: v });
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id="followup-reason">
              <SelectValue placeholder="Escolha o motivo" />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>Outro</SelectItem>
            </SelectContent>
          </Select>
          {otherReason && (
            <Input
              aria-label="Outro motivo"
              value={value.reason}
              onChange={(e) => set({ reason: e.target.value })}
              placeholder="Qual o motivo?"
              disabled={disabled}
            />
          )}
        </div>
      )}

      {recycle && (
        <div className="space-y-2">
          <Label id="followup-return-label">Vai voltar?</Label>
          <RadioGroup
            aria-labelledby="followup-return-label"
            className="flex gap-4"
            value={willReturn ? "yes" : "no"}
            onValueChange={(v) => set({ willReturn: v === "yes" })}
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="followup-return-yes" value="yes" />
              <Label htmlFor="followup-return-yes" className="font-normal">Sim</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="followup-return-no" value="no" />
              <Label htmlFor="followup-return-no" className="font-normal">Não</Label>
            </div>
          </RadioGroup>
          {!willReturn && (
            <p className="text-xs text-muted-foreground">
              Sem data de volta: só registramos o motivo, sem aviso nem mensagem.
            </p>
          )}
        </div>
      )}

      {willReturn && (
        <>
          <div className="space-y-2">
            <Label htmlFor="followup-date">Data e hora</Label>
            <div className="flex gap-2">
              <Input
                id="followup-date"
                type="date"
                value={value.date}
                onChange={(e) => set({ date: e.target.value })}
                disabled={disabled}
                className="min-w-0 flex-1"
              />
              <Input
                aria-label="Hora"
                type="time"
                value={value.time}
                onChange={(e) => set({ time: e.target.value })}
                disabled={disabled}
                className="w-28 shrink-0"
              />
            </div>
            <p className="text-xs text-muted-foreground">Horário de Brasília.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="followup-owner">Responsável</Label>
            <UserPicker
              id="followup-owner"
              value={value.ownerId}
              onChange={(ownerId) => set({ ownerId })}
              noneLabel="Dono do negócio"
              disabled={disabled}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="followup-notify" className="font-normal">Avisar o responsável</Label>
            <Switch
              id="followup-notify"
              checked={value.notifyOwner}
              onCheckedChange={(notifyOwner) => set({ notifyOwner })}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="followup-send" className="font-normal">Enviar mensagem ao cliente</Label>
              <Switch
                id="followup-send"
                checked={value.sendMessage && canSend}
                onCheckedChange={(sendMessage) => set({ sendMessage })}
                disabled={disabled || !canSend}
              />
            </div>
            {lineError ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Não foi possível verificar a linha de WhatsApp — tente de novo.
                {onRetryLine && (
                  <button type="button" className="underline underline-offset-2" onClick={onRetryLine}>
                    Tentar de novo
                  </button>
                )}
              </p>
            ) : (
              !hasLine && (
                <p className="text-xs text-muted-foreground">
                  Configure uma linha de WhatsApp em Outreach para enviar mensagens.
                </p>
              )
            )}
          </div>

          {value.sendMessage && canSend && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label id="followup-channel-label">Canal</Label>
                <RadioGroup
                  aria-labelledby="followup-channel-label"
                  value={value.channel}
                  onValueChange={(v) => set({ channel: v === "email" ? "email" : "whatsapp" })}
                  disabled={disabled}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="followup-channel-wa" value="whatsapp" />
                    <Label htmlFor="followup-channel-wa" className="font-normal">
                      WhatsApp{lineLabel ? ` — ${lineLabel}` : ""}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="followup-channel-email" value="email" disabled />
                    <Label htmlFor="followup-channel-email" className="font-normal text-muted-foreground">
                      E-mail — em breve
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="followup-message">Mensagem</Label>
                <Textarea
                  id="followup-message"
                  rows={4}
                  value={value.messageText}
                  onChange={(e) => set({ messageText: e.target.value })}
                  placeholder="Oi {{lead.first_name}}, tudo bem?"
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Variáveis:{" "}
                  {MESSAGE_VARIABLES.map((v, i) => (
                    <span key={v.key}>
                      {i > 0 && " "}
                      <code title={v.label} className="rounded bg-muted px-1 py-0.5">{`{{${v.key}}}`}</code>
                    </span>
                  ))}
                </p>
              </div>
            </div>
          )}

          {recycle && (
            <div className="space-y-2">
              <Label id="followup-when-label">Quando chegar a data</Label>
              <RadioGroup
                aria-labelledby="followup-when-label"
                value={returns ? "return" : "keep"}
                onValueChange={(v) => set({ returnStageId: v === "return" ? stages[0]?.id ?? null : null })}
                disabled={disabled}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="followup-when-keep" value="keep" />
                  <Label htmlFor="followup-when-keep" className="font-normal">Manter no Reciclo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="followup-when-return" value="return" disabled={stages.length === 0} />
                  <Label htmlFor="followup-when-return" className="font-normal">Voltar para a etapa</Label>
                </div>
              </RadioGroup>
              {returns && (
                <Select
                  value={value.returnStageId ?? undefined}
                  onValueChange={(returnStageId) => set({ returnStageId })}
                  disabled={disabled}
                >
                  <SelectTrigger aria-label="Etapa de volta">
                    <SelectValue placeholder="Escolha a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
