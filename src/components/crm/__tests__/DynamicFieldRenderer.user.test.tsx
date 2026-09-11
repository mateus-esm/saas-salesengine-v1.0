// Sprint 11 · Onda 2 · T16 — the "Usuário" field in the deal form.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useMemberDirectory", () => ({
  useMemberDirectory: () => ({
    members: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Luiz", email: "luiz@x.test" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Mateus", email: "mateus@x.test" },
    ],
    nameOf: (id: string | null | undefined) =>
      id === "11111111-1111-4111-8111-111111111111" ? "Luiz" : id === "22222222-2222-4222-8222-222222222222" ? "Mateus" : null,
    isLoading: false,
  }),
}));
// EntityLinker (refs) talks to Supabase; not under test here.
vi.mock("@/components/crm/EntityLinker", () => ({ EntityLinker: () => null }));

import { DynamicFieldRenderer, validateCustomData } from "../DynamicFieldRenderer";
import type { CustomFieldSchema } from "@/types/pipelines";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // cmdk scrolls the active option into view.
  Element.prototype.scrollIntoView ??= () => {};
});

const LUIZ = "11111111-1111-4111-8111-111111111111";

const field: CustomFieldSchema = {
  field_id: "f-pre",
  key: "pre_vendedor",
  label: "Pré-vendedor",
  type: "user",
  required: false,
  position: 0,
};

describe("DynamicFieldRenderer — user field", () => {
  it("picks a team member and stores the profile id under the field_id", () => {
    const onChange = vi.fn();
    render(<DynamicFieldRenderer schema={[field]} value={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Pré-vendedor|Ninguém/ }));
    fireEvent.click(screen.getByRole("option", { name: /Luiz/ }));
    expect(onChange).toHaveBeenCalledWith({ "f-pre": LUIZ });
  });

  it("shows the chosen member's name and can clear it", () => {
    const onChange = vi.fn();
    render(<DynamicFieldRenderer schema={[field]} value={{ "f-pre": LUIZ }} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: /Luiz/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /Ninguém/ }));
    expect(onChange).toHaveBeenCalledWith({ "f-pre": null });
  });
});

describe("validateCustomData — user field", () => {
  it("accepts a profile id or nothing", () => {
    expect(validateCustomData([field], { "f-pre": LUIZ })).toEqual([]);
    expect(validateCustomData([field], {})).toEqual([]);
  });

  it("refuses text that is not a profile id", () => {
    const errors = validateCustomData([field], { "f-pre": "Luiz da Silva" });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/usuário inválido/i);
  });

  it("a required user field must be filled", () => {
    expect(validateCustomData([{ ...field, required: true }], {})).toHaveLength(1);
  });
});
