// Sprint 8.2 · discovery_q&a · T75 — o controle de uma pergunta.
//
// Sem jest-dom: o projeto não registra os matchers (vite.config.ts tem
// setupFiles vazio), então aqui se afirma sobre o DOM diretamente.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DiscoveryQuestion } from "@/lib/discovery/types";
import { QuestionField } from "../QuestionField";

const q = (over: Partial<DiscoveryQuestion>): DiscoveryQuestion => ({
  code: "x", block: "b", block_label: "Bloco", sort_order: 1, label: "Pergunta",
  help: null, type: "text", options: [], default_value: null, required: true,
  maps_to: "agent", niche_id: null, max_select: null, ...over,
});

describe("QuestionField", () => {
  it("multi devolve a lista com o item marcado e sem o desmarcado", () => {
    const onChange = vi.fn();
    const question = q({
      type: "multi",
      options: [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }],
    });
    const { rerender } = render(
      <QuestionField question={question} value={["a"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Beta"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);

    rerender(<QuestionField question={question} value={["a", "b"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Alfa"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("multi com teto não deixa marcar além do limite", () => {
    render(
      <QuestionField
        question={q({
          type: "multi", max_select: 1,
          options: [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }],
        })}
        value={["a"]}
        onChange={vi.fn()}
      />,
    );
    // O que já está marcado continua clicável (para desmarcar); o resto trava.
    expect(screen.getByLabelText("Beta").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Alfa").hasAttribute("disabled")).toBe(false);
  });

  it("select_other mostra o texto livre quando a resposta não é uma das opções", () => {
    render(
      <QuestionField
        question={q({ type: "select_other", options: [{ value: "padrao", label: "Padrão" }] })}
        value="meu funil escrito à mão"
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("meu funil escrito à mão");
  });

  it("select_other não mostra texto livre quando a resposta é uma das opções", () => {
    render(
      <QuestionField
        question={q({ type: "select_other", options: [{ value: "padrao", label: "Padrão" }] })}
        value="padrao"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("marca o campo importado, para o cliente conferir o que a IA respondeu", () => {
    render(<QuestionField question={q({})} value="x" onChange={vi.fn()} imported />);
    expect(screen.queryByText(/conferir/i)).not.toBeNull();
  });
});
