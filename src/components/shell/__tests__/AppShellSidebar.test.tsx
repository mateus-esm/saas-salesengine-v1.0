import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";

const auth = vi.hoisted(() => ({
  value: {
    profile: { chat_link_base: "/chat", equipe_id: "e1" },
    equipe: { page_permissions: { webhooks: true } as Record<string, boolean> },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({ hasRole: () => true, isSuperAdmin: () => false }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { name: "Solo" } }),
}));
vi.mock("@/hooks/useCustomTables", () => ({
  useCustomTables: () => ({
    tables: [{ slug: "propostas", name: "Propostas" }],
    isLoading: false,
  }),
}));

import { AppShellSidebar } from "../AppShellSidebar";

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) =>
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

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SidebarProvider>
        <AppShellSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppShellSidebar", () => {
  it("marca o link da tabela ativa e mantém o grupo CRM expandido", () => {
    renderAt("/crm?tab=tabelas&custom_table=propostas");
    const link = screen.getByRole("link", { name: "Propostas" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Tabelas" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("CRM")).toBeTruthy();
  });

  it("não renderiza Webhooks quando a permissão está desligada", () => {
    auth.value = {
      ...auth.value,
      equipe: { page_permissions: { webhooks: false } },
    };
    renderAt("/home");
    expect(screen.queryByRole("link", { name: "Webhooks" })).toBeNull();
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("aria-current")).toBe("page");
  });
});
