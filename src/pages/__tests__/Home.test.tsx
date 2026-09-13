// Sprint 11 · T68 — the app opens on the Copilot; the modules stay below.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ copilotOn: true }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { nome_completo: "Mateus Maia", chat_link_base: null },
    equipe: { nome: "Solo Energia", is_crm_agent_enabled: mocks.copilotOn },
  }),
}));

vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { name: "Solo Ventures" } }) }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => ({ hasRole: () => true }) }));
vi.mock("@/components/AppHubCard", () => ({ AppHubCard: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("@/components/crm/copilot/CopilotHome", () => ({ CopilotHome: () => <div>copilot-home</div> }));

import Home from "../Home";

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);

describe("Home", () => {
  beforeEach(() => {
    mocks.copilotOn = true;
  });

  it("with the Copilot on, opens on the conversation and keeps the modules below", () => {
    const { container, getByText } = renderHome();
    expect(getByText("copilot-home")).toBeTruthy();
    expect(getByText("Pipeline CRM")).toBeTruthy();
    expect(container.textContent).not.toContain("Sua máquina de vendas automatizada");
    const text = container.textContent ?? "";
    expect(text.indexOf("copilot-home")).toBeLessThan(text.indexOf("Pipeline CRM"));
  });

  it("with the Copilot off, the opening of before and the modules", () => {
    mocks.copilotOn = false;
    const { container, getByText } = renderHome();
    expect(container.textContent).not.toContain("copilot-home");
    expect(getByText(/Sua máquina de vendas automatizada/)).toBeTruthy();
    expect(getByText("Pipeline CRM")).toBeTruthy();
  });
});
