import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({ members: [], nameOf: () => null, isLoading: false }),
}));
const line = vi.hoisted(() => ({ hasLine: true, label: "Linha 1", isLoading: false }));
vi.mock("@/hooks/useFollowups", () => ({ useOutreachLine: () => line }));

import { RecycleDialog } from "../RecycleDialog";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const stage = {
  stage_type: "ciclo",
  cycle_days: 30,
  cycle_target_stage_id: "s1",
  recycle_notify_owner: false,
  recycle_send_message: true,
  recycle_message_template: "Oi {{lead.first_name}}",
};
const stages = [
  { id: "s1", name: "Novo", stage_type: "open" },
  { id: "s2", name: "Ganho", stage_type: "won" },
];

function setup(over: Partial<React.ComponentProps<typeof RecycleDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <RecycleDialog open stage={stage} stages={stages} targetStageId="c" reasons={["Sem verba", "Sem retorno"]} leadName="Ana" ownerId={null} onConfirm={onConfirm} onCancel={onCancel} {...over} />,
  );
  return { onConfirm, onCancel };
}

beforeEach(() => {
  line.hasLine = true;
});

describe("RecycleDialog (Sprint 15b · T4)", () => {
  it("shows the stage defaults", () => {
    setup();
    expect(screen.getByText(/Ana/)).toBeTruthy();
    expect(screen.getByLabelText("Avisar o responsável").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByLabelText("Enviar mensagem ao cliente").getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("Oi {{lead.first_name}}");
    expect((screen.getByLabelText("Data e hora") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not confirm without a reason", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Mover para o Reciclo" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("'Vai voltar? Não' with a typed reason confirms without date fields", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByLabelText("Não"));
    expect(screen.queryByLabelText("Data e hora")).toBeNull();
    // free-text reason through "Outro"
    fireEvent.click(screen.getByLabelText("Motivo"));
    fireEvent.click(screen.getByRole("option", { name: "Outro" }));
    fireEvent.change(screen.getByLabelText("Outro motivo"), { target: { value: "Mudou de cidade" } });
    fireEvent.click(screen.getByRole("button", { name: "Mover para o Reciclo" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ reason: "Mudou de cidade", willReturn: false });
  });

  it("cancel does not confirm", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
