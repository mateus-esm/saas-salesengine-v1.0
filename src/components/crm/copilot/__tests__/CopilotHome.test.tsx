// Sprint 11 · Onda 6 · T64 — the Copilot's home.
// Sprint 11 · T68 — it became the app's opening: the greeting, the question, and
// one line that opens what waits for a person and what the Copilot did.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  undo: vi.fn(),
  send: vi.fn(),
  admin: true,
}));

vi.mock("@/hooks/useCopilotFeed", () => ({
  useCopilotFeed: () => ({
    feed: {
      pending: [{ id: "d1", status: "pending_approval", at: new Date().toISOString(), label: "Marcar como ganho", why: "risky",
                  reason: "Cliente assinou", opportunity_id: "o1", pipeline_id: "p1", contact: "Ana" }],
      recent: [{ id: "d2", status: "auto_applied", at: new Date().toISOString(), label: "Moveu para Proposta",
                 opportunity_id: "o2", pipeline_id: "p1", contact: "Bia" }],
      failures: [],
      today: { applied: 1, read: 3 },
    },
    isLoading: false,
    resolve: { mutate: mocks.resolve },
    undo: { mutate: mocks.undo },
  }),
}));

vi.mock("@/hooks/useCopilotChat", () => ({
  useCopilotChat: () => ({ turns: [], sending: false, send: mocks.send, reset: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { nome_completo: "Mateus Maia" } }),
}));

vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({ isAdmin: () => mocks.admin }),
}));

vi.mock("@/components/crm/copilot/CopilotSettingsSheet", () => ({ CopilotSettingsSheet: () => null }));

import { CopilotHome } from "../CopilotHome";

const renderHome = () => render(<MemoryRouter><CopilotHome /></MemoryRouter>);

describe("CopilotHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin = true;
  });

  it("opens on the greeting and the question", () => {
    const { getByText, getByLabelText } = renderHome();
    expect(getByText("Olá, Mateus")).toBeTruthy();
    expect(getByText("Entenda como está sua máquina de receita")).toBeTruthy();
    expect(getByLabelText("Pergunta para o Copilot")).toBeTruthy();
  });

  it("one line says what waits and what was done; it opens both lists", () => {
    const { getByText, queryByText } = renderHome();
    expect(queryByText("Marcar como ganho")).toBeNull();
    fireEvent.click(getByText("1 para aprovar · 1 ação hoje"));
    expect(getByText("Marcar como ganho")).toBeTruthy();
    expect(getByText("Moveu para Proposta")).toBeTruthy();
    expect(getByText(/3 negócios lidos · 1 ação/)).toBeTruthy();
  });

  it("approving calls the verb for that suggestion; undo too", () => {
    const { getByText } = renderHome();
    fireEvent.click(getByText("1 para aprovar · 1 ação hoje"));
    fireEvent.click(getByText("Aprovar"));
    expect(mocks.resolve).toHaveBeenCalledWith({ id: "d1", approve: true }, expect.anything());
    fireEvent.click(getByText("Desfazer"));
    expect(mocks.undo).toHaveBeenCalledWith("d2", expect.anything());
  });

  it("a suggestion chip asks its question", () => {
    const { getByText } = renderHome();
    fireEvent.click(getByText("Onde devo focar?"));
    expect(mocks.send).toHaveBeenCalledWith("Onde devo focar?");
  });

  it("only an admin sees Configurar", () => {
    expect(renderHome().queryByText("Configurar")).toBeTruthy();
    mocks.admin = false;
    const { container } = renderHome();
    expect(container.textContent).not.toContain("Configurar");
  });
});
