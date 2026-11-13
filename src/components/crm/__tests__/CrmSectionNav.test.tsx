import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useCustomTables", () => ({
  useCustomTables: () => ({ tables: [{ slug: "propostas", name: "Propostas" }], isLoading: false }),
}));

import { CrmSectionNav } from "../CrmSectionNav";

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <CrmSectionNav />
    </MemoryRouter>,
  );

describe("CrmSectionNav", () => {
  it("marca a seção ativa com aria-current e usa links", () => {
    renderAt("/crm?tab=contacts");
    const link = screen.getByRole("link", { name: "Base de Contatos" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("href")).toBe("/crm?tab=contacts");
    expect(screen.getByRole("link", { name: "Empresas" }).getAttribute("aria-current")).toBeNull();
  });

  it("sem tab, o Pipeline é a ativa", () => {
    renderAt("/crm");
    expect(screen.getByRole("link", { name: "Pipeline" }).getAttribute("aria-current")).toBe("page");
  });

  it("Tabelas é um menu que lista as tabelas personalizadas", async () => {
    renderAt("/crm?tab=tabelas");
    const trigger = screen.getByRole("button", { name: /Tabelas/ });
    expect(trigger.getAttribute("aria-current")).toBe("page");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Todas as tabelas" })).toBeTruthy();
    const item = await screen.findByRole("menuitem", { name: "Propostas" });
    expect(item.getAttribute("href")).toBe("/crm?tab=tabelas&custom_table=propostas");
  });

  it("marca a tabela personalizada ativa no menu", async () => {
    renderAt("/crm?tab=tabelas&custom_table=propostas");
    fireEvent.keyDown(screen.getByRole("button", { name: /Tabelas/ }), { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: "Propostas" });
    expect(item.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("menuitem", { name: "Todas as tabelas" }).getAttribute("aria-current")).toBeNull();
  });
});
