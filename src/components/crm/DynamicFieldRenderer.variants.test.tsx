import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DynamicFieldRenderer } from "./DynamicFieldRenderer";
import type { CustomFieldSchema } from "@/types/pipelines";

// O renderer importa o EntityLinker, que importa o client do Supabase (exige env no build).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const field = (id: string, label: string): CustomFieldSchema => ({
  field_id: id, key: id, label, type: "text", required: false, position: 0,
});

describe("DynamicFieldRenderer textVariants (formulário público de ingestão)", () => {
  it("textarea vira <textarea> e email vira type=email; o resto segue texto", () => {
    render(
      <DynamicFieldRenderer
        schema={[field("obs", "Observações"), field("mail", "E-mail"), field("nome", "Nome")]}
        value={{}}
        onChange={() => {}}
        textVariants={{ obs: "textarea", mail: "email" }}
      />,
    );
    expect(screen.getByLabelText(/Observações/).tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText(/E-mail/).getAttribute("type")).toBe("email");
    expect(screen.getByLabelText(/Nome/).tagName).toBe("INPUT");
    expect(screen.getByLabelText(/Nome/).getAttribute("type")).not.toBe("email");
  });
});
