// Sprint 11 · Onda 6 · T65 — the Copilot on one deal.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  brief: null as unknown,
  resolve: vi.fn(),
  undo: vi.fn(),
}));

vi.mock("@/hooks/useCopilotDeal", () => ({
  useCopilotDeal: () => ({ data: mocks.brief, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useCopilotFeed", () => ({
  useCopilotDecisionActions: () => ({ resolve: { mutate: mocks.resolve }, undo: { mutate: mocks.undo } }),
}));

import { DealCopilotPanel } from "../DealCopilotPanel";

const brief = (extra: Record<string, unknown> = {}) => ({
  opportunity: { id: "o1", contact: "Ana", stage: "Proposta", owner: "Bia", days_in_stage: 2 },
  summary: "Quer usina de 5 kWp; conta de 450 kWh.",
  summary_at: "2026-09-14T12:00:00Z",
  origin: null,
  open_tasks: [],
  pending: [{ id: "d1", label: "Marcar como ganho", why: "risky", at: "2026-09-14T12:00:00Z" }],
  recent: [{ id: "d2", label: "Moveu para Proposta", status: "auto_applied", at: "2026-09-14T11:00:00Z" }],
  last_job: { status: "done", reason: "conversation", finished_at: "2026-09-14T12:00:00Z", last_error: null,
              result: { applied: 2, pending: 1 } },
  ...extra,
});

describe("DealCopilotPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the summary, what waits and what it did", () => {
    mocks.brief = brief();
    const { getByText } = render(<DealCopilotPanel opportunityId="o1" enabled />);
    expect(getByText("Quer usina de 5 kWp; conta de 450 kWh.")).toBeTruthy();
    expect(getByText("Última leitura: 2 ações, 1 para aprovar")).toBeTruthy();
    expect(getByText("Marcar como ganho")).toBeTruthy();
    expect(getByText("pede aprovação")).toBeTruthy();
    expect(getByText(/Moveu para Proposta/)).toBeTruthy();
  });

  it("approve and undo call the verbs for that decision", () => {
    mocks.brief = brief();
    const { getByLabelText, getByText } = render(<DealCopilotPanel opportunityId="o1" enabled />);
    fireEvent.click(getByLabelText("Aprovar"));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: "d1", approve: true }, expect.anything());
    fireEvent.click(getByText("Desfazer"));
    expect(mocks.undo).toHaveBeenCalledWith("d2", expect.anything());
  });

  it("a deal the Copilot never read says so", () => {
    mocks.brief = brief({ summary: null, pending: [], recent: [], last_job: null });
    const { getByText } = render(<DealCopilotPanel opportunityId="o1" enabled />);
    expect(getByText("O Copilot ainda não leu a conversa deste negócio.")).toBeTruthy();
  });
});
