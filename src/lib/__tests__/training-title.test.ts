import { describe, it, expect } from "vitest";
import {
  parseTrainingText, buildTrainingText, fallbackBlockLabel, TRAINING_TITLE_MAX,
} from "../training-title";

describe("training block names", () => {
  it("round-trips a name and its content", () => {
    const stored = buildTrainingText("BL01", "Trocas em até 30 dias.");
    expect(parseTrainingText(stored)).toEqual({
      title: "BL01", content: "Trocas em até 30 dias.",
    });
  });

  it("preserves multi-line content exactly", () => {
    const body = "linha 1\nlinha 2\n\nlinha 4";
    expect(parseTrainingText(buildTrainingText("Nome", body)).content).toBe(body);
  });

  // The critical safety property: blocks written before this convention, or
  // edited in the provider's console, must come back untouched.
  it("leaves un-named legacy text completely alone", () => {
    const legacy = "Conteúdo antigo sem título.\nSegunda linha.";
    expect(parseTrainingText(legacy)).toEqual({ title: null, content: legacy });
  });

  it("does not mistake ordinary content for a name", () => {
    for (const text of [
      "# Título: isto é markdown",
      "Título: sem colchetes",
      "[[outra coisa]]\ncorpo",
      "texto antes\n[[Título: tarde demais]]",
    ]) {
      expect(parseTrainingText(text)).toEqual({ title: null, content: text });
    }
  });

  it("omits the sentinel entirely when there is no name", () => {
    expect(buildTrainingText(null, "corpo")).toBe("corpo");
    expect(buildTrainingText("", "corpo")).toBe("corpo");
    expect(buildTrainingText("   ", "corpo")).toBe("corpo");
  });

  // A "]" or newline inside the name would break the sentinel on the way back
  // and split the tenant's block.
  it("neutralises characters that would break the sentinel", () => {
    const stored = buildTrainingText("qu]ebra\nlinha", "corpo");
    const parsed = parseTrainingText(stored);
    expect(parsed.content).toBe("corpo");
    expect(parsed.title).not.toContain("]");
    expect(parsed.title).not.toContain("\n");
  });

  it("caps the name length", () => {
    const parsed = parseTrainingText(buildTrainingText("x".repeat(200), "corpo"));
    expect(parsed.title!.length).toBe(TRAINING_TITLE_MAX);
    expect(parsed.content).toBe("corpo");
  });

  it("treats an empty sentinel as unnamed but still strips it", () => {
    expect(parseTrainingText("[[Título: ]]\ncorpo")).toEqual({ title: null, content: "corpo" });
  });

  it("handles null and undefined input", () => {
    expect(parseTrainingText(null)).toEqual({ title: null, content: "" });
    expect(parseTrainingText(undefined)).toEqual({ title: null, content: "" });
  });

  it("numbers unnamed blocks positionally", () => {
    expect(fallbackBlockLabel(0)).toBe("BL01");
    expect(fallbackBlockLabel(11)).toBe("BL12");
  });
});
