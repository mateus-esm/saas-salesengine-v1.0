import { describe, expect, it } from "vitest";

import {
  INDICACAO_PRESET,
  intakeFormUrl,
  slugify,
  validateIntakeDefinition,
  validateIntakeValues,
  type IntakeField,
} from "./intakeForms";

const f = (over: Partial<IntakeField>): IntakeField => ({
  key: "nome", label: "Nome", type: "text", required: true, target: "lead.name", ...over,
});

describe("validateIntakeValues", () => {
  const fields: IntakeField[] = [
    f({}),
    f({ key: "tel", label: "Telefone", type: "phone", required: false, target: "lead.phone" }),
    f({ key: "mail", label: "E-mail", type: "email", required: false, target: "lead.email" }),
    f({ key: "porte", label: "Porte", type: "select", required: false, target: "custom:11111111-1111-1111-1111-111111111111", options: ["PF", "PJ"] }),
  ];

  it("exige os obrigatórios e telefone ou e-mail", () => {
    expect(validateIntakeValues(fields, {})).toEqual([{ key: "nome", message: "Nome é obrigatório" }]);
    expect(validateIntakeValues(fields, { nome: "Ana" })[0]).toMatchObject({ key: "tel" });
    expect(validateIntakeValues(fields, { nome: "Ana", tel: "(85) 99262-5840" })).toEqual([]);
  });

  it("recusa e-mail, telefone e opção inválidos", () => {
    const keys = validateIntakeValues(fields, { nome: "Ana", tel: "123", mail: "x", porte: "ZZ" }).map((e) => e.key);
    expect(keys).toEqual(["tel", "mail", "porte"]);
  });
});

describe("validateIntakeDefinition", () => {
  it("o modelo de Indicação é válido", () => {
    expect(validateIntakeDefinition(INDICACAO_PRESET.fields)).toEqual([]);
  });

  it("pede um nome e um telefone ou e-mail, chaves únicas e destino conhecido", () => {
    expect(validateIntakeDefinition([])).not.toEqual([]);
    expect(validateIntakeDefinition([f({}), f({})]).join()).toMatch(/repetid/);
    expect(validateIntakeDefinition([f({ target: "lead.name" }), f({ key: "x", target: "lead.cpf" as never })]).join()).toMatch(/destino/i);
    expect(validateIntakeDefinition([f({})]).join()).toMatch(/telefone ou e-mail/);
  });
});

describe("helpers", () => {
  it("slugify tira acento e símbolos", () => {
    expect(slugify("Formulário de Indicação!")).toBe("formulario-de-indicacao");
  });
  it("monta o link público", () => {
    expect(intakeFormUrl("https://app.x.com", "ab")).toBe("https://app.x.com/f/ab");
  });
});
