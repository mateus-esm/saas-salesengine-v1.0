import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgendaEventDialog } from "../AgendaEventDialog";

const save = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/hooks/useAgendaEvents", () => ({ useAgendaEvents: () => ({ saveEvent: { mutateAsync: save } }) }));
vi.mock("../MeetingOutcomeButtons", () => ({ MeetingOutcomeButtons: () => null }));

describe("Agenda do negócio", () => {
  it("salva a visita com a oportunidade do card, a hora local e as notas", async () => {
    const close = vi.fn();
    render(<AgendaEventDialog opportunityId="o-1" initialStart="2026-12-02T14:00" initialEnd="2026-12-02T15:00" onClose={close} />);
    fireEvent.change(screen.getByLabelText("Tipo"), {target: {value: "Visita"}});
    fireEvent.change(screen.getByLabelText("Título"), {target: {value: "Vistoria"}});
    fireEvent.change(screen.getByLabelText("Observações"), {target: {value: "Levar a planta"}});
    fireEvent.click(screen.getByRole("button", {name: "Salvar"}));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      opportunity_id: "o-1", title: "Vistoria", type: "visit", notes: "Levar a planta",
      starts_at: new Date(2026, 11, 2, 14).toISOString(),
    }));
  });
});
