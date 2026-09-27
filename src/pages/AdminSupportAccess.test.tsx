import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";

// `owner` é o DONO DO TIME (cliente): NÃO abre o painel Admin.
// Só o administrador geral (super_admin) opera o atendimento de todos os tenants.
const mocks = vi.hoisted(() => ({ role: "owner", from: vi.fn() }));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    role: mocks.role,
    loadingRole: false,
    isSuperAdmin: () => mocks.role === "super_admin",
    isOwner: () => mocks.role === "owner" || mocks.role === "super_admin",
    isAdmin: () => mocks.role !== "user",
    hasRole: () => mocks.role === "super_admin",
    canAccess: () => mocks.role === "super_admin",
  }),
}));
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

describe("Acesso ao painel Admin", () => {
  it("owner (dono do time) é redirecionado: não abre o painel", async () => {
    mocks.role = "owner";
    render(<MemoryRouter initialEntries={["/admin?tab=tickets"]}><Admin /></MemoryRouter>);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/home"));
    expect(screen.queryByText("Atendimento de tickets")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("admin comum também não abre o painel", async () => {
    mocks.role = "admin";
    render(<MemoryRouter initialEntries={["/admin?tab=tickets"]}><Admin /></MemoryRouter>);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/home"));
    expect(screen.queryByText("Atendimento de tickets")).toBeNull();
  });

  it("super_admin abre o painel e vê a aba Tickets", async () => {
    mocks.role = "super_admin";
    render(<MemoryRouter initialEntries={["/admin?tab=tickets"]}><Admin /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Atendimento de tickets")).toBeTruthy());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
