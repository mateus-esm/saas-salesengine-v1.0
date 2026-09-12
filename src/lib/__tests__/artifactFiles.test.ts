import { describe, expect, it } from "vitest";

import { artifactFilePath, filesOf, formatBytes, safeFileName } from "../artifactFiles";

describe("artifactFilePath", () => {
  it("puts the team's folder first (what the Storage policy checks), then table, record and a unique name", () => {
    expect(artifactFilePath("eq-1", "tab-2", "rec-3", "Proposta Comercial – João.PDF", "f9")).toBe(
      "eq-1/tab-2/rec-3/f9-proposta-comercial-joao.pdf",
    );
  });
});

describe("safeFileName", () => {
  it("keeps the extension and drops what a storage key would choke on", () => {
    expect(safeFileName("Contrato assinado (v2).pdf")).toBe("contrato-assinado-v2.pdf");
    expect(safeFileName("sem-extensao")).toBe("sem-extensao");
    expect(safeFileName("!!!.docx")).toBe("arquivo.docx");
  });
});

describe("filesOf", () => {
  it("reads the list the field keeps", () => {
    const files = filesOf([{ path: "eq/t/r/1-a.pdf", name: "a.pdf", size: 2048, type: "application/pdf", uploaded_at: "2026-09-12" }]);
    expect(files).toEqual([
      { path: "eq/t/r/1-a.pdf", name: "a.pdf", size: 2048, type: "application/pdf", uploaded_at: "2026-09-12" },
    ]);
  });

  it("reads one file, and an imported link named by its last part", () => {
    expect(filesOf({ url: "https://x.test/files/proposta%20final.pdf" })).toEqual([
      { path: "", name: "proposta final.pdf", size: null, type: null, uploaded_at: null, url: "https://x.test/files/proposta%20final.pdf" },
    ]);
  });

  it("reads anything else as no files", () => {
    expect(filesOf(null)).toEqual([]);
    expect(filesOf("texto")).toEqual([]);
    expect(filesOf([{ nome: "sem caminho" }, 3])).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("writes the size the way people read it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3,5 MB");
    expect(formatBytes(null)).toBe("");
  });
});
