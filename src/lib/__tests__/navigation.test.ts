import { describe, expect, it } from "vitest";
import { buildNav, isNavItemActive, type NavContext, type NavItem } from "../navigation";
import { TOP_TABS } from "../crmTabs";

const ROLE_RANK = { user: 0, admin: 1, owner: 2, super_admin: 3 } as const;

const makeCtx = (over: Partial<NavContext> & { role?: keyof typeof ROLE_RANK } = {}): NavContext => {
  const { role = "owner", ...rest } = over;
  return {
    hasRole: (r) => ROLE_RANK[role] >= ROLE_RANK[r],
    isSuperAdmin: false,
    permissions: null,
    chatHref: "/chat",
    crmTabs: [...TOP_TABS],
    customTables: [],
    ...rest,
  };
};

const flat = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...(i.children ? flat(i.children) : [])]);
const allTitles = (ctx: NavContext) => flat(buildNav(ctx).flatMap((g) => g.items)).map((i) => i.title);

describe("buildNav", () => {
  it("admin sees every group", () => {
    const groups = buildNav(makeCtx({ role: "admin" }));
    expect(groups.map((g) => g.label)).toEqual([null, "CRM", "Automação", "Conta", "Em breve"]);
  });

  it("user without admin loses Automação and admin-only account items", () => {
    const groups = buildNav(makeCtx({ role: "user" }));
    expect(groups.map((g) => g.label)).not.toContain("Automação");
    const titles = allTitles(makeCtx({ role: "user" }));
    expect(titles).not.toContain("Equipe");
    expect(titles).not.toContain("Billing");
    expect(titles).not.toContain("Suporte");
    expect(titles).toContain("Central de Ajuda");
  });

  it("permission false hides even for admin, super admin bypasses", () => {
    const permissions = { webhooks: false };
    const titles = allTitles(makeCtx({ role: "admin", permissions }));
    expect(titles).not.toContain("Webhooks");
    expect(titles).not.toContain("Outreach");
    const sa = allTitles(makeCtx({ role: "admin", permissions, isSuperAdmin: true }));
    expect(sa).toContain("Webhooks");
    expect(sa).toContain("Outreach");
  });

  it("crm items follow crmTabs", () => {
    const crm = buildNav(makeCtx({ crmTabs: ["pipeline", "contacts"] })).find((g) => g.label === "CRM");
    expect(crm?.items.map((i) => i.url)).toEqual(["/crm?tab=pipeline", "/crm?tab=contacts"]);
  });

  it("custom tables become children of Tabelas", () => {
    const crm = buildNav(makeCtx({ customTables: [{ slug: "propostas", name: "Propostas" }] })).find(
      (g) => g.label === "CRM",
    );
    const tabelas = crm?.items.find((i) => i.title === "Tabelas");
    expect(tabelas?.children?.[0].url).toBe("/crm?tab=tabelas&custom_table=propostas");
    expect(tabelas?.children?.[0].title).toBe("Propostas");
  });

  it("super admin sees Admin; admin without super does not", () => {
    const sa = buildNav(makeCtx({ role: "owner", isSuperAdmin: true })).find((g) => g.label === "Conta")!;
    expect(sa.items[sa.items.length - 1]).toMatchObject({ id: "admin", title: "Admin", url: "/admin" });
    expect(allTitles(makeCtx({ role: "admin" }))).not.toContain("Admin");
  });

  it("chat is external when href is http and ids are unique", () => {
    const ctx = makeCtx({ chatHref: "https://chat.example.com", customTables: [{ slug: "a", name: "A" }] });
    const items = flat(buildNav(ctx).flatMap((g) => g.items));
    expect(items.find((i) => i.title === "Chat")?.external).toBe(true);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isNavItemActive", () => {
  const nav = buildNav(makeCtx({ customTables: [{ slug: "propostas", name: "Propostas" }] }));
  const items = flat(nav.flatMap((g) => g.items));
  const by = (t: string) => items.find((i) => i.title === t)!;
  const loc = (pathname: string, search = "") => ({ pathname, search });

  it("crm tab matching", () => {
    expect(isNavItemActive(by("Base de Contatos"), loc("/crm", "?tab=contacts"))).toBe(true);
    expect(isNavItemActive(by("Pipeline"), loc("/crm", "?tab=contacts"))).toBe(false);
  });

  it("custom table child and parent", () => {
    const l = loc("/crm", "?tab=tabelas&custom_table=propostas");
    expect(isNavItemActive(by("Propostas"), l)).toBe(true);
    expect(isNavItemActive(by("Tabelas"), l)).toBe(true);
    expect(isNavItemActive(by("Propostas"), loc("/crm", "?tab=tabelas"))).toBe(false);
    expect(isNavItemActive(by("Tabelas"), loc("/crm", "?tab=tabelas"))).toBe(true);
  });

  it("custom table slug with special characters", () => {
    const slug = "ação&b";
    const n = buildNav(makeCtx({ customTables: [{ slug, name: "X" }] }));
    const child = flat(n.flatMap((g) => g.items)).find((i) => i.id === `crm-table-${slug}`)!;
    expect(isNavItemActive(child, loc("/crm", `?tab=tabelas&custom_table=${encodeURIComponent(slug)}`))).toBe(true);
  });

  it("no tab means pipeline", () => {
    expect(isNavItemActive(by("Pipeline"), loc("/crm"))).toBe(true);
  });

  it("plain routes", () => {
    expect(isNavItemActive(by("Início"), loc("/home"))).toBe(true);
    expect(isNavItemActive(by("AI Studio"), loc("/ai-studio/knowledge"))).toBe(true);
    expect(isNavItemActive(by("Início"), loc("/homework"))).toBe(false);
  });

  it("external never active", () => {
    const ext = buildNav(makeCtx({ chatHref: "https://x.com/chat" }))[0].items.find((i) => i.title === "Chat")!;
    expect(isNavItemActive(ext, loc("/chat"))).toBe(false);
  });
});
