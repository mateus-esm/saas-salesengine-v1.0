import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { chat_link_base: "/chat", equipe_id: "e1" },
    equipe: { page_permissions: {} },
  }),
}));
vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({ hasRole: () => true, isSuperAdmin: () => false }),
}));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { name: "Solo" } }) }));
vi.mock("@/hooks/useCustomTables", () => ({
  useCustomTables: () => ({ tables: [{ slug: "propostas", name: "Propostas" }], isLoading: false }),
}));

import { AppShellSidebar } from "../AppShellSidebar";

beforeAll(() => {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }) as MediaQueryList);
});

beforeEach(() => {
  localStorage.clear();
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <SidebarTrigger aria-label="gatilho" />
        <AppShellSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

const root = () => document.querySelector("[data-state][data-side]") as HTMLElement;

describe("barra lateral recolhível", () => {
  it("o gatilho esconde a barra inteira (offcanvas) e mostra de novo", () => {
    renderAt("/home");
    expect(root().getAttribute("data-state")).toBe("expanded");
    fireEvent.click(screen.getByLabelText("gatilho"));
    expect(root().getAttribute("data-state")).toBe("collapsed");
    expect(root().getAttribute("data-collapsible")).toBe("offcanvas");
    fireEvent.click(screen.getByLabelText("gatilho"));
    expect(root().getAttribute("data-state")).toBe("expanded");
  });

  it("o botão do rodapé alterna o modo ícones e lembra em rev.sidebar.mode", () => {
    renderAt("/home");
    fireEvent.click(screen.getByRole("button", { name: /modo ícones/i }));
    expect(localStorage.getItem("rev.sidebar.mode")).toBe("icon");
    fireEvent.click(screen.getByLabelText("gatilho"));
    expect(root().getAttribute("data-collapsible")).toBe("icon");
  });

  it("lê o modo salvo", () => {
    localStorage.setItem("rev.sidebar.mode", "icon");
    renderAt("/home");
    fireEvent.click(screen.getByLabelText("gatilho"));
    expect(root().getAttribute("data-collapsible")).toBe("icon");
  });

  it("o grupo recolhe e lembra em rev.sidebar.groups", () => {
    renderAt("/home");
    const header = screen.getByRole("button", { name: "Automação" });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(localStorage.getItem("rev.sidebar.groups") || "{}").automation).toBe(false);
  });

  it("um grupo salvo como recolhido volta recolhido", () => {
    localStorage.setItem("rev.sidebar.groups", JSON.stringify({ automation: false }));
    renderAt("/home");
    expect(screen.getByRole("button", { name: "Automação" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("o grupo com o item ativo abre sozinho mesmo salvo como recolhido", () => {
    localStorage.setItem("rev.sidebar.groups", JSON.stringify({ crm: false }));
    renderAt("/crm?tab=contacts");
    expect(screen.getByRole("button", { name: "CRM" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("o primeiro grupo (sem rótulo) não é recolhível", () => {
    renderAt("/home");
    expect(screen.getByRole("link", { name: "Início" })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded") && /Início|Dashboard/.test(b.textContent ?? ""))).toHaveLength(0);
  });
});
