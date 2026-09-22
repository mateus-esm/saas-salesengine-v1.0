// SE-COPILOT-002 — the pipeline's approval panel: it reads the queue without
// opening anything, answers several at once with one summary, and shows its
// loading / error / empty states instead of the old silent `null`.

import type { ComponentProps } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { AiDecision } from "@/hooks/useCopilotApprovals";

const mocks = vi.hoisted(() => ({
  decisions: [] as AiDecision[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  resolveApproval: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useCopilotApprovals", () => ({
  useCopilotApprovals: () => ({
    data: mocks.decisions,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    refetch: mocks.refetch,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { equipe_id: "e1" } }),
}));

vi.mock("@/services/copilot", () => ({
  resolveApproval: (...args: unknown[]) => mocks.resolveApproval(...args),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import { CopilotApprovalsPanel } from "../CopilotApprovalsPanel";

const decision = (id: string, label: string, why: string): AiDecision => ({
  id,
  equipe_id: "e1",
  pipeline_id: "p1",
  lead_id: "l1",
  opportunity_id: "o1",
  agent_role: "copilot",
  status: "pending_approval",
  output_action: { action: { type: "move_stage" }, label, why },
  input_summary: "Cliente confirmou",
  confidence_score: 0.62,
  created_at: new Date(2026, 8, 14, 10).toISOString(),
  lead: { id: "l1", name: "Ana Souza", phone: "5511999998888" },
});

const renderPanel = (props: Partial<ComponentProps<typeof CopilotApprovalsPanel>> = {}) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CopilotApprovalsPanel pipelineId="p1" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("CopilotApprovalsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decisions = [decision("d1", "Moveu para Ganho", "risky"), decision("d2", "Nota no negócio", "low_confidence")];
    mocks.isLoading = false;
    mocks.isError = false;
    mocks.resolveApproval.mockResolvedValue({});
  });

  it("reads the action, the deal, the confidence, the why and the state", () => {
    const { getByText } = renderPanel();

    // The queue row carries all five without opening anything.
    const row = getByText("Moveu para Ganho").closest("li") as HTMLElement;
    expect(row.textContent).toContain("Ana Souza");
    expect(row.textContent).toContain("62%");
    expect(row.textContent).toContain("pede aprovação");
    expect(row.textContent).toContain("aguardando");
    expect(row.textContent).toContain("Cliente confirmou");
  });

  it("answers the selection with one call per decision and a single summary", async () => {
    const { getByLabelText, getByRole } = renderPanel();

    fireEvent.click(getByLabelText("Selecionar Moveu para Ganho"));
    fireEvent.click(getByLabelText("Selecionar Nota no negócio"));
    fireEvent.click(getByRole("button", { name: /Aprovar selecionadas/ }));

    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledTimes(2));
    expect(mocks.resolveApproval).toHaveBeenCalledWith("d1", "approve");
    expect(mocks.resolveApproval).toHaveBeenCalledWith("d2", "approve");
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("2 aplicadas."));
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("a call that fails is one error in the summary, not a toast per item", async () => {
    mocks.resolveApproval
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("500"));

    const { getByLabelText, getByRole } = renderPanel();
    fireEvent.click(getByLabelText("Selecionar Moveu para Ganho"));
    fireEvent.click(getByLabelText("Selecionar Nota no negócio"));
    fireEvent.click(getByRole("button", { name: /Recusar selecionadas/ }));

    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith("1 recusada; 1 com erro."));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("the individual buttons still answer one decision", async () => {
    const { getAllByText } = renderPanel();

    fireEvent.click(getAllByText("Aprovar")[0]);

    await waitFor(() => expect(mocks.resolveApproval).toHaveBeenCalledWith("d1", "approve"));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Ação aprovada com sucesso."));
  });

  it("shows the queue loading instead of rendering nothing", () => {
    mocks.isLoading = true;
    const { container } = renderPanel();

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("an error offers a retry", () => {
    mocks.isError = true;
    const { getByRole } = renderPanel();

    fireEvent.click(getByRole("button", { name: "Tentar de novo" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("says nothing waits when the pipeline has no pending decision", () => {
    mocks.decisions = [];
    const { getByText } = renderPanel();

    expect(getByText("Nada esperando por você.")).toBeTruthy();
  });
});
