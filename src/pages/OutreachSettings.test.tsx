// src/pages/OutreachSettings.test.tsx
//
// SE-REV-004 — "clico, ele diz que salvou, mas não salva". A tela abria sempre
// em "Nova sequência": quem voltava a ela e ajustava a regra criava uma
// segunda sequência, e a original nunca mudava. Estes testes fixam que voltar à
// tela abre a regra salva e que salvar a EDITA (manda o id).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) } },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import OutreachSettings from "./OutreachSettings";

const PROFILE = {
  provider: "gptmaker",
  channel_id: "3F32F1093C8681A460108E59734FC41E",
  solo_instance_id: null,
  send_window_start: "08:00:00",
  send_window_end: "22:00:00",
  timezone: "America/Sao_Paulo",
  max_sends_per_line_hour: 30,
  opt_out_keywords: ["sair"],
  enabled: true,
  first_message: "Oi {{lead.first_name}}! Aqui é da {{tenant.name}}.",
  trigger_entry_ids: ["5a0349b1-efd4-4d17-b9ab-4f8502ff8574"],
};
const SEQUENCE = {
  id: "5396de90-d294-4e4f-a7b0-40ff41dff8b7",
  name: "Novo Lead - Meta ADS (Cadastro)",
  active: true,
  trigger_event: "lead_intake",
  trigger_entry_ids: ["7e6576a0-696f-40a9-841c-d64721979181"],
  reenroll: "once_per_lead",
  stop_on_reply: true,
  stop_on_stage_change: true,
  steps: [{ position: 0, offset_minutes: 0, message_template: "Oi" }],
};

function listResponse(sequences: unknown[]) {
  return {
    sequences,
    entries: [
      { id: "7e6576a0-696f-40a9-841c-d64721979181", name: "Manual", kind: "manual", label: "Manual (Manual)" },
      { id: "5a0349b1-efd4-4d17-b9ab-4f8502ff8574", name: "Meta ADS - Cadastro", kind: "webhook", label: "Meta ADS - Cadastro (Webhook)" },
    ],
    hidden_entries: [
      { id: "dcf93cfc-fe10-4570-804b-5e542ebde515", name: "Meta ADS - Cadastro", kind: "webhook", reason: "webhook_deleted" },
    ],
    tenant_name: "Casa Flow",
    solo_instances: [],
    gpt_channels: [],
    gpt_channels_error: null,
    profile: PROFILE,
  };
}

function mockBackend(sequences: unknown[]) {
  mocks.invoke.mockImplementation((fn: string, { body }: { body: Record<string, unknown> }) => {
    if (fn === "start-conversation") return Promise.resolve({ data: { settings: body }, error: null });
    if (body.action === "delete-sequence") {
      return Promise.resolve({ data: { deleted: true, name: SEQUENCE.name }, error: null });
    }
    if (body.action === "list-sequences") return Promise.resolve({ data: listResponse(sequences), error: null });
    if (body.action === "upsert-sequence") {
      const sent = body.sequence as Record<string, unknown>;
      return Promise.resolve({
        data: { sequence: { ...sent, id: sent.id ?? "nova-id", steps: body.steps } },
        error: null,
      });
    }
    return Promise.resolve({ data: {}, error: null });
  });
}

const calls = (action: string, fn = "outreach") =>
  mocks.invoke.mock.calls
    .filter(([name]) => name === fn)
    .map(([, { body }]) => body)
    .filter((body: Record<string, unknown>) => body.action === action);
const upserts = () => calls("upsert-sequence");

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OutreachSettings />
    </QueryClientProvider>,
  );
}

describe("OutreachSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("voltar à tela abre a regra salva e salvar edita a mesma sequência (não cria outra)", async () => {
    mockBackend([SEQUENCE]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = (
      <QueryClientProvider client={qc}>
        <OutreachSettings />
      </QueryClientProvider>
    );
    // Sai da tela (ex.: foi ao chat) e volta: o componente remonta.
    render(view).unmount();
    render(view);

    expect(await screen.findByText(`Editando: ${SEQUENCE.name}`)).toBeTruthy();
    expect((screen.getByDisplayValue(SEQUENCE.name) as HTMLInputElement).value).toBe(SEQUENCE.name);

    fireEvent.change(screen.getByDisplayValue(SEQUENCE.name), { target: { value: "Novo Lead" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(upserts()).toHaveLength(1));
    const sent = upserts()[0].sequence as Record<string, unknown>;
    expect(sent.id).toBe(SEQUENCE.id);
    expect(sent.name).toBe("Novo Lead");
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Alterações salvas."));
  });

  it("sem sequência, a tela deixa claro que salvar cria uma nova", async () => {
    mockBackend([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OutreachSettings />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "Criar sequência" })).toBeTruthy();
    expect(screen.getByText(/Salvar cria uma sequência nova/)).toBeTruthy();
  });

  // ── SE-REV-005 ──────────────────────────────────────────────────────────

  it("mostra a mensagem de abertura salva, com preview, e grava a edição", async () => {
    mockBackend([SEQUENCE]);
    renderPage();
    const field = (await screen.findByDisplayValue(PROFILE.first_message)) as HTMLTextAreaElement;
    expect(screen.getByTestId("opener-message-preview").textContent).toContain("Oi Maria! Aqui é da Casa Flow.");

    fireEvent.change(field, { target: { value: "Olá {{lead.name}}, tudo bem?" } });
    expect(screen.getByTestId("opener-message-preview").textContent).toContain("Olá Maria Souza, tudo bem?");
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem de abertura" }));

    await waitFor(() => expect(calls("update-settings", "start-conversation")).toHaveLength(1));
    expect(calls("update-settings", "start-conversation")[0]).toEqual({
      action: "update-settings",
      enabled: true,
      first_message: "Olá {{lead.name}}, tudo bem?",
      trigger_entry_ids: ["5a0349b1-efd4-4d17-b9ab-4f8502ff8574"],
    });
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Mensagem de abertura salva."));
  });

  it("variável inexistente é apontada e bloqueia o salvar (abertura e passo)", async () => {
    mockBackend([SEQUENCE]);
    renderPage();
    const opener = await screen.findByDisplayValue(PROFILE.first_message);
    fireEvent.change(opener, { target: { value: "Oi {{lead.nome}}" } });
    expect(screen.getAllByRole("alert")[0].textContent).toContain("{{lead.nome}} não existe");
    expect((screen.getByRole("button", { name: "Salvar mensagem de abertura" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByDisplayValue("Oi"), { target: { value: "Oi {lead.name}" } });
    expect((screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls("update-settings", "start-conversation")).toHaveLength(0);
  });

  it("as variáveis aparecem nos dois lugares e clicar insere no texto", async () => {
    mockBackend([SEQUENCE]);
    renderPage();
    const openerVars = await screen.findByTestId("opener-message-variables");
    const stepVars = screen.getByTestId("step-0-message-variables");
    for (const key of ["lead.name", "lead.first_name", "lead.source", "tenant.name"]) {
      expect(openerVars.textContent).toContain(`{{${key}}}`);
      expect(stepVars.textContent).toContain(`{{${key}}}`);
    }
    fireEvent.click(within(stepVars).getByRole("button", { name: "{{lead.source}}" }));
    expect(screen.getByDisplayValue("Oi{{lead.source}}")).toBeTruthy();
  });

  it("portas: rótulo desambiguado, órfã fora da lista e explicada", async () => {
    mockBackend([SEQUENCE]);
    renderPage();
    const card = await screen.findByTestId("opener-card");
    expect(within(card).getByText("Meta ADS - Cadastro (Webhook)")).toBeTruthy();
    expect(within(card).getByTestId("hidden-entries").textContent).toContain("Meta ADS - Cadastro (webhook apagado)");
  });

  it("apagar sequência pede confirmação e manda o id", async () => {
    mockBackend([{ ...SEQUENCE, enrollment_counts: { active: 2, completed: 5 } }]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar" }));
    expect(await screen.findByText(/2 lead\(s\) ainda têm mensagens/)).toBeTruthy();
    expect(calls("delete-sequence")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Apagar sequência" }));
    await waitFor(() => expect(calls("delete-sequence")).toEqual([{ action: "delete-sequence", sequence_id: SEQUENCE.id }]));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(`Sequência "${SEQUENCE.name}" apagada.`));
  });
});
