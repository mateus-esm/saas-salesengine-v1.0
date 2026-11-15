// SE-FIX-001 — no StagesEditor de verdade: digitar nos campos de texto de uma
// etapa grava UMA vez por edição (no blur), não uma vez por caractere.
//
// O DraftField.test.tsx cobre a regra do rascunho isolada; este arquivo prova
// que cada campo de texto livre da etapa está de fato ligado nela — nome,
// descrição, webhook do ciclo e modelo de mensagem do Reciclo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { PipelineStageV2 } from "@/types/pipelines";

const updateMutate = vi.fn();
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });

const stage: PipelineStageV2 = {
  id: "s-1",
  equipe_id: "e-1",
  pipeline_id: "p-1",
  name: "Etapa",
  color: "#999999",
  position: 0,
  stage_type: "ciclo",
  max_idle_hours: null,
  max_interactions: null,
  cadence_value: null,
  cadence_unit: null,
  webhook_triggers: [],
  funnel_event: null,
  description: "",
  cycle_days: 30,
  cycle_target_stage_id: null,
  cycle_webhook_url: null,
  recycle_notify_owner: false,
  recycle_send_message: true,
  recycle_message_template: "",
  created_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
};

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/usePipelines", () => ({
  usePipelines: () => ({
    pipelines: [{ id: "p-1", name: "Vendas", loss_reasons: [] }],
    updatePipeline: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/hooks/usePipelineStagesV2", () => ({
  usePipelineStagesV2: () => ({
    stages: [stage],
    isLoading: false,
    createStage: mutation(),
    updateStage: { mutate: updateMutate, mutateAsync: vi.fn(), isPending: false },
    deleteStage: mutation(),
    reorderStages: mutation(),
  }),
}));
vi.mock("@/hooks/useWebhookConfigs", () => ({ useWebhookConfigs: () => ({ configs: [] }) }));

import { StagesEditor } from "../StagesEditor";

const renderEditor = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StagesEditor pipelineId="p-1" />
    </QueryClientProvider>,
  );

// Mesmo par de eventos do DraftField.test.tsx (React 17+ delega por focusin/out).
const focusField = (el: HTMLElement) => {
  fireEvent(el, new FocusEvent("focus", { bubbles: false }));
  fireEvent(el, new FocusEvent("focusin", { bubbles: true }));
};
const blurField = (el: HTMLElement, relatedTarget: EventTarget | null = null) => {
  fireEvent(el, new FocusEvent("blur", { bubbles: false, relatedTarget }));
  fireEvent(el, new FocusEvent("focusout", { bubbles: true, relatedTarget }));
};

/** Digita `text` um caractere por vez, a partir de `start`. */
const typeChars = (el: HTMLElement, start: string, text: string) => {
  let acc = start;
  for (const ch of text) {
    acc += ch;
    fireEvent.change(el, { target: { value: acc } });
  }
  return acc;
};

describe("StagesEditor — SE-FIX-001: um UPDATE por edição, não por tecla", () => {
  beforeEach(() => updateMutate.mockClear());

  const cases: Array<{ label: string; start: string; typed: string; patch: Record<string, unknown> }> = [
    { label: "Nome da etapa", start: "Etapa", typed: " nova", patch: { name: "Etapa nova" } },
    {
      label: "Descrição da etapa",
      start: "",
      typed: "Avaliando proposta",
      patch: { description: "Avaliando proposta" },
    },
    {
      label: "Webhook do ciclo",
      start: "",
      typed: "https://x.io/h",
      patch: { cycle_webhook_url: "https://x.io/h" },
    },
  ];

  for (const c of cases) {
    it(`${c.label}: nenhuma gravação durante a digitação, uma no blur`, () => {
      renderEditor();
      const el = screen.getByLabelText(c.label);
      focusField(el);
      typeChars(el, c.start, c.typed);
      expect(updateMutate).not.toHaveBeenCalled();

      blurField(el);
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledWith({ id: "s-1", ...c.patch });
    });
  }

  it("Modelo de mensagem do Reciclo: grava uma vez ao sair, mantendo o aviso de variável ao vivo", () => {
    renderEditor();
    const el = screen.getByLabelText("Modelo de mensagem");
    focusField(el);
    typeChars(el, "", "Oi {{lead.nao_existe}}");
    expect(updateMutate).not.toHaveBeenCalled();
    // O aviso de variável inexistente aparece durante a edição, sem gravar nada.
    expect(screen.getByRole("alert")).toBeTruthy();

    blurField(el);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith({
      id: "s-1",
      recycle_message_template: "Oi {{lead.nao_existe}}",
    });
  });

  it("Modelo de mensagem: ir do texto para o botão de variável não grava (o foco segue no campo)", () => {
    renderEditor();
    const el = screen.getByLabelText("Modelo de mensagem");
    const variables = screen.getByTestId(`recycle-template-${stage.id}-variables`);
    const button = variables.querySelector("button") as HTMLButtonElement;

    focusField(el);
    typeChars(el, "", "Oi ");
    blurField(el, button);
    focusField(button);
    fireEvent.click(button);
    expect(updateMutate).not.toHaveBeenCalled();

    blurField(button);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [[arg]] = updateMutate.mock.calls;
    expect(arg.id).toBe("s-1");
    expect(arg.recycle_message_template).toMatch(/^Oi \{\{.+\}\}$/);
  });
});
