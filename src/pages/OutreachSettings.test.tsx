// src/pages/OutreachSettings.test.tsx
//
// SE-REV-004 — "clico, ele diz que salvou, mas não salva". A tela abria sempre
// em "Nova sequência": quem voltava a ela e ajustava a regra criava uma
// segunda sequência, e a original nunca mudava. Estes testes fixam que voltar à
// tela abre a regra salva e que salvar a EDITA (manda o id).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    entries: [{ id: "7e6576a0-696f-40a9-841c-d64721979181", name: "Manual", kind: "manual" }],
    solo_instances: [],
    gpt_channels: [],
    gpt_channels_error: null,
    profile: PROFILE,
  };
}

function mockBackend(sequences: unknown[]) {
  mocks.invoke.mockImplementation((_fn: string, { body }: { body: Record<string, unknown> }) => {
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

const upserts = () =>
  mocks.invoke.mock.calls
    .map(([, { body }]) => body)
    .filter((body: Record<string, unknown>) => body.action === "upsert-sequence");

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
});
