import { useState } from "react";
import { format, addHours, startOfHour } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DealPicker } from "./DealPicker";
import { MeetingOutcomeButtons } from "./MeetingOutcomeButtons";
import { canRecordOutcome } from "@/lib/meetingOutcome";
import { useAgendaEvents, type AgendaEvent } from "@/hooks/useAgendaEvents";

export const eventTypes: Record<string, string> = { meeting: "Reunião", visit: "Visita", compromisso: "Compromisso", block: "Bloqueio" };
const local = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

export function AgendaEventDialog({ event, opportunityId, initialStart, initialEnd, onClose, types = [] }: {
  event?: AgendaEvent; opportunityId?: string; initialStart?: string; initialEnd?: string;
  onClose: () => void; types?: string[];
}) {
  const { saveEvent } = useAgendaEvents(false);
  const start = addHours(startOfHour(new Date()), 1);
  const [title, setTitle] = useState(event?.title ?? (opportunityId ? "Reunião" : ""));
  const [type, setType] = useState(event ? eventTypes[event.type] ?? event.type : "Reunião");
  const [startsAt, setStarts] = useState(event ? local(new Date(event.starts_at)) : initialStart ?? local(start));
  const [endsAt, setEnds] = useState(event ? local(new Date(event.ends_at)) : initialEnd ?? local(addHours(start, 1)));
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [dealId, setDealId] = useState(event ? event.opportunity_id ?? null : opportunityId ?? null);
  const [changedLink, setChangedLink] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !type.trim() || endsAt <= startsAt) { setError("Informe título, tipo e término após o início."); return; }
    const typeKey = Object.keys(eventTypes).find((key) => eventTypes[key].toLowerCase() === type.trim().toLowerCase()) ?? type.trim();
    try {
      await saveEvent.mutateAsync({ id: event?.id, title: title.trim(), type: typeKey,
        starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(),
        notes: notes.trim() || null, opportunity_id: dealId,
        lead_id: changedLink ? null : event?.lead_id ?? null });
      onClose();
    } catch (err) { setError((err as Error).message); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{event ? "Editar evento" : "Agendar evento"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">Título<Input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label className="block text-sm">Tipo<Input list="agenda-type-options" value={type} maxLength={80} required onChange={(e) => setType(e.target.value)} /></label>
        <datalist id="agenda-type-options">{[...new Set([...Object.values(eventTypes), ...types.map(t => eventTypes[t] ?? t)])].map(t => <option key={t} value={t} />)}</datalist>
        {!opportunityId && !event?.outcome && <DealPicker value={dealId} onChange={(v) => { setDealId(v?.id ?? null); setChangedLink(true); }} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Início<Input type="datetime-local" required value={startsAt} onChange={(e) => setStarts(e.target.value)} /></label>
          <label className="text-sm">Término<Input type="datetime-local" required min={startsAt} value={endsAt} onChange={(e) => setEnds(e.target.value)} /></label>
        </div>
        <label className="block text-sm">Observações<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {event && canRecordOutcome(event) && <MeetingOutcomeButtons agendaEventId={event.id} opportunityId={event.opportunity_id} current={event.outcome} />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={saveEvent.isPending}>Salvar</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
