import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SupportTickets } from "./SupportTickets";

const mocks = vi.hoisted(() => ({
  useTickets: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(), select: vi.fn(),
  from: vi.fn(), refresh: vi.fn(), error: vi.fn(), success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ equipe: { id: "equipe-a" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("@/hooks/useSupportTickets", () => ({
  useSupportTickets: mocks.useTickets, TICKET_PAGE_SIZE: 25,
  TICKET_STATUS: { aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido", fechado: "Fechado" },
}));
const ticket = {
  id: "ticket-a", equipe_id: "equipe-a", subject: "Falha na tela", description: "Descrição original",
  status: "aberto", created_at: "2026-09-27T10:00:00Z", updated_at: "2026-09-27T10:00:00Z",
};
function mount(admin = false, url = "/suporte") {
  return render(<MemoryRouter initialEntries={[url]}><QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <SupportTickets admin={admin} />
  </QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { id: "ticket-a" }, error: null });
  mocks.useTickets.mockImplementation((_admin, _status, _team, _page, id) => ({
    enabled: true, refresh: mocks.refresh,
    tickets: { data: { rows: [ticket], count: 1 } },
    teams: { data: [{ id: "equipe-a", nome: "Equipe A" }, { id: "equipe-b", nome: "Equipe B" }] },
    ticket: { data: id ? ticket : null },
    messages: { data: { pages: [[{ id: "resposta", body: "Já estamos verificando", author_kind: "suporte", created_at: ticket.created_at }]] } },
  }));
});
afterEach(cleanup);

describe("Tickets de suporte", () => {
  it("abre ticket com a equipe da sessão e preserva o assunto sem espaços extras", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Assunto"), { target: { value: " Dúvida " } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: " Preciso de ajuda " } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir ticket" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({ equipe_id: "equipe-a", subject: "Dúvida", description: "Preciso de ajuda" }));
    await waitFor(() => expect(screen.getByText("Descrição original")).toBeTruthy());
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it("mantém o rascunho se a criação falhar", async () => {
    mocks.single.mockResolvedValue({ error: { message: "Falha" } });
    mount();
    fireEvent.change(screen.getByLabelText("Assunto"), { target: { value: "Ajuda" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir ticket" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect((screen.getByLabelText("Descrição") as HTMLTextAreaElement).value).toBe("Meu rascunho");
  });
  it("cliente lê a resposta e responde sem escolher autoria ou status", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    mount(false, "/suporte?ticket=ticket-a");
    expect(screen.getByText("Já estamos verificando")).toBeTruthy();
    expect(screen.queryByLabelText("Status do ticket")).toBeNull();
    fireEvent.change(screen.getByLabelText("Sua resposta"), { target: { value: " Obrigado " } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar resposta" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith({ ticket_id: "ticket-a", body: "Obrigado" }));
    expect(mocks.from).toHaveBeenCalledWith("support_ticket_messages");
  });
  it("admin filtra por equipe e status e altera somente o status do ticket selecionado", async () => {
    mount(true, "/admin?tab=tickets&ticket=ticket-a");
    expect(screen.queryByLabelText("Assunto")).toBeNull();
    fireEvent.change(screen.getByLabelText("Equipe"), { target: { value: "equipe-b" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "resolvido" } });
    expect(mocks.useTickets).toHaveBeenLastCalledWith(true, "resolvido", "equipe-b", 0, "ticket-a");
    fireEvent.change(screen.getByLabelText("Status do ticket"), { target: { value: "em_atendimento" } });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ status: "em_atendimento" }));
    expect(mocks.eq).toHaveBeenCalledWith("id", "ticket-a");
  });
  it("ticket fora do escopo não mostra formulário de resposta", () => {
    const normal = mocks.useTickets.getMockImplementation()!;
    mocks.useTickets.mockImplementation((...args) => ({ ...normal(...args), ticket: { data: null } }));
    mount(false, "/suporte?ticket=outro");
    expect(screen.getByText("Ticket indisponível ou sem permissão de acesso.")).toBeTruthy();
    expect(screen.queryByLabelText("Sua resposta")).toBeNull();
  });
});
