import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mutateAsync = vi.hoisted(() => vi.fn());
// Stable like react-query's data (a new object per render would re-run the defaults).
const timeline = vi.hoisted(() => ({
    isLoading: false,
    error: null,
    data: {
      summary: {
        created_at: "2026-11-01T10:00:00Z", closed_at: null, cycle_days: 18, first_response_hours: 2,
        touchpoints: 3, last_touchpoint_at: null, meetings_scheduled: 1, meetings_done: 1, no_shows: 1,
        stage_sla_hours: null, hours_in_stage: 1, value: 20000, won_snapshot: null,
      },
      items: [
        { id: "i1", name: "Usina solar", quantity: 1, unit_price: 14000, total: 14000 },
        { id: "i2", name: "Bateria", quantity: 1, unit_price: 6000, total: 6000 },
      ],
      artifacts: [
        { id: "p1", kind: "proposal", table: "Propostas", title: "Proposta A", status: "sent", value: 20000, items: null, created_at: "2026-11-05T00:00:00Z" },
        { id: "c1", kind: "contract", table: "Contratos", title: "Contrato A", status: "sent", value: 14000, items: null, created_at: "2026-11-06T00:00:00Z" },
      ],
      events: [],
    },
}));
vi.mock("@/hooks/useDealTimeline", () => ({
  useCloseWon: () => ({ mutateAsync, isPending: false }),
  useDealTimeline: () => timeline,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WonDialog } from "../WonDialog";

describe("WonDialog", () => {
  it("saves only the items that closed, the chosen proposal/contract, then moves", async () => {
    mutateAsync.mockResolvedValue({ value: 14000 });
    const onConfirm = vi.fn();
    render(<WonDialog open opportunityId="o1" leadName="Alcides" onCancel={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText("1 no-show")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("checkbox")[1]); // Bateria ficou fora
    const confirm = screen.getByRole("button", { name: /Confirmar ganho/ });
    expect(confirm.textContent).toContain("14.000");
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      opportunityId: "o1",
      items: [
        { id: "i1", won: true, unit_price: 14000 },
        { id: "i2", won: false, unit_price: 6000 },
      ],
      proposalId: "p1",
      contractId: "c1",
      value: null,
    });
  });
});
