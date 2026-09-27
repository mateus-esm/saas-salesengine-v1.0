import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";

const mocks = vi.hoisted(() => ({ role: "owner", from: vi.fn() }));
vi.mock("@/hooks/useRole", () => ({ useRole: () => ({ role: mocks.role, loadingRole: false, isSuperAdmin: () => mocks.role === "super_admin" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/components/admin/support/TicketsTab", () => ({ TicketsTab: () => <p>Atendimento de tickets</p> }));
vi.mock("@/components/admin/notifications/NotificationsTab", () => ({ NotificationsTab: () => <p>Notificações antigas</p> }));
vi.mock("@/components/admin/proposals/ProposalsTab", () => ({ ProposalsTab: () => null }));
vi.mock("@/components/admin/onboarding/OnboardingTab", () => ({ OnboardingTab: () => null }));
vi.mock("@/components/admin/billing/BillingTab", () => ({ AdminBillingTab: () => null }));
vi.mock("@/components/admin/billing/TeamBillingDialog", () => ({ TeamBillingDialog: () => null }));
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterAll(() => { Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Acesso administrativo ao suporte", () => {
  it("owner acessa somente Tickets mesmo com URL de uma aba antiga", async () => {
    mocks.role = "owner";
    render(<MemoryRouter initialEntries={["/admin?tab=equipes"]}><Admin /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Atendimento de tickets")).toBeTruthy());
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Tickets"]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("admin comum não monta o atendimento global nem consulta os dados antigos", async () => {
    mocks.role = "admin";
    render(<MemoryRouter initialEntries={["/admin?tab=tickets"]}><Admin /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText("Atendimento de tickets")).toBeNull());
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
