// SE-COPILOT-001 — the approval queue: pick several, answer them in one go,
// and the states around it (loading, error, empty, filtered-out).

import type { ComponentProps } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { CopilotApprovals } from "../CopilotApprovals";
import type { FeedItem } from "@/lib/copilotFeed";

const item = (id: string, label: string, why: string | null): FeedItem => ({
  id,
  status: "pending_approval",
  at: new Date(2026, 8, 14, 10).toISOString(),
  label,
  why,
  opportunity_id: "o1",
  pipeline_id: "p1",
  contact: "Ana",
});

const twoItems = [item("a", "Marcar como ganho", "risky"), item("b", "Mudar o valor", "low_confidence")];

const renderQueue = (props: Partial<ComponentProps<typeof CopilotApprovals>> = {}) =>
  render(
    <MemoryRouter>
      <CopilotApprovals
        items={twoItems}
        busyId={null}
        onResolve={vi.fn()}
        onResolveMany={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );

describe("CopilotApprovals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("approves everything selected in one go", () => {
    const onResolveMany = vi.fn();
    const { getByLabelText, getByRole } = renderQueue({ onResolveMany });

    fireEvent.click(getByLabelText("Selecionar Marcar como ganho"));
    fireEvent.click(getByLabelText("Selecionar Mudar o valor"));
    expect(getByRole("button", { name: /Aprovar selecionadas/ })).toBeTruthy();

    fireEvent.click(getByRole("button", { name: /Aprovar selecionadas/ }));
    expect(onResolveMany).toHaveBeenCalledWith(["a", "b"], true);
  });

  it("rejects the selection without touching the others", () => {
    const onResolveMany = vi.fn();
    const { getByLabelText, getByRole } = renderQueue({ onResolveMany });

    fireEvent.click(getByLabelText("Selecionar Mudar o valor"));
    fireEvent.click(getByRole("button", { name: /Recusar selecionadas/ }));
    expect(onResolveMany).toHaveBeenCalledWith(["b"], false);
  });

  it("selecting all takes the whole visible queue", () => {
    const onResolveMany = vi.fn();
    const { getByLabelText, getByRole } = renderQueue({ onResolveMany });

    fireEvent.click(getByLabelText("Selecionar todas as sugestões visíveis"));
    fireEvent.click(getByRole("button", { name: /Aprovar selecionadas/ }));
    expect(onResolveMany).toHaveBeenCalledWith(["a", "b"], true);
  });

  it("a chip filters by why it waits, and counts what it hides", () => {
    const { getByRole, queryByText } = renderQueue();

    expect(queryByText("Marcar como ganho")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /confiança baixa/ }));
    expect(queryByText("Marcar como ganho")).toBeNull();
    expect(queryByText("Mudar o valor")).toBeTruthy();
  });

  it("the individual buttons still answer one suggestion", () => {
    const onResolve = vi.fn();
    const { getAllByText } = renderQueue({ onResolve });

    fireEvent.click(getAllByText("Aprovar")[0]);
    expect(onResolve).toHaveBeenCalledWith("a", true);
  });

  it("says nothing waits when the queue is empty", () => {
    const { getByText } = renderQueue({ items: [] });
    expect(getByText("Nada esperando por você.")).toBeTruthy();
  });

  it("shows a placeholder while loading", () => {
    const { container } = renderQueue({ items: [], isLoading: true });
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("an error offers a retry", () => {
    const onRetry = vi.fn();
    const { getByText } = renderQueue({ items: [], isError: true, onRetry });

    fireEvent.click(getByText("Tentar de novo"));
    expect(onRetry).toHaveBeenCalled();
  });
});
