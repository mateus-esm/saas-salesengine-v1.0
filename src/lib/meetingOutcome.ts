// SE-SUP1-8 (#10) — o desfecho de uma reunião, registrado à mão.
//
// O botão chama crm_record_meeting_outcome, que grava o marco em funnel_events
// pelo record_funnel_event de sempre. O que fica em agenda_events.outcome é só o
// estado do botão (qual está marcado) — a contagem nunca lê dali.

export type MeetingOutcome = "done" | "no_show" | "technical_visit";

export const MEETING_OUTCOMES: { value: MeetingOutcome; label: string; marco: "meeting_done" | "no_show" }[] = [
  { value: "done", label: "Realizada", marco: "meeting_done" },
  { value: "no_show", label: "No-show", marco: "no_show" },
  { value: "technical_visit", label: "Visita técnica", marco: "meeting_done" },
];

export const outcomeLabel = (o: string | null | undefined): string | null =>
  MEETING_OUTCOMES.find((x) => x.value === o)?.label ?? null;

/** O botão de um evento só aparece em reunião ligada a um contato ou negócio. */
export function canRecordOutcome(ev: { type: string; lead_id: string | null; opportunity_id?: string | null }): boolean {
  return ev.type === "meeting" && !!(ev.lead_id || ev.opportunity_id);
}

/** Clicar no desfecho já marcado desmarca (null = desfazer, só na agenda). */
export function nextOutcome(current: string | null | undefined, clicked: MeetingOutcome, fromAgenda: boolean): MeetingOutcome | null {
  return fromAgenda && current === clicked ? null : clicked;
}

const ERRORS: [RegExp, string][] = [
  [/opportunity_required/, "Este contato não tem negócio aberto para registrar a reunião."],
  [/opportunity_not_found/, "Negócio não encontrado."],
  [/agenda_event_not_found/, "Evento da agenda não encontrado."],
  [/forbidden|not_authenticated/, "Sem permissão para registrar neste negócio."],
  [/invalid_outcome/, "Desfecho inválido."],
];

export function outcomeErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  return ERRORS.find(([re]) => re.test(msg))?.[1] ?? "Não foi possível registrar o desfecho.";
}

/** Texto do toast depois de gravar. */
export function outcomeToast(r: { outcome: string | null; already_recorded?: boolean }): string {
  if (r.outcome === null) return "Desfecho desfeito";
  const label = outcomeLabel(r.outcome) ?? "Desfecho";
  return r.already_recorded ? `${label}: já estava contado hoje` : `${label} registrado`;
}
