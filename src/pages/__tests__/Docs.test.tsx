// SE-DOCS-001 — Central de Ajuda: índice lista os guias, artigo renderiza,
// slug inexistente mostra estado vazio, e /tutorial redireciona para /docs.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({
  // Sem linhas no banco -> o hook usa o fallback estático do bundle.
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) },
}));

import DocsLayout from "../docs/DocsLayout";
import DocsIndex from "../docs/DocsIndex";
import DocsArticle from "../docs/DocsArticle";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<DocsIndex />} />
            <Route path=":slug" element={<DocsArticle />} />
          </Route>
          <Route path="/tutorial" element={<Navigate to="/docs" replace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Central de Ajuda", () => {
  it("o índice lista os guias dos módulos reais", async () => {
    renderAt("/docs");
    // O título de cada artigo aparece mais de uma vez na árvore: na sidebar do
    // layout (hidden md:block) e de novo no bloco mobile do índice (md:hidden).
    // jsdom não aplica CSS, então ambos renderizam — a query é por todos.
    expect((await screen.findAllByText("Chat: atendimento com o agente de IA")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billing: plano, créditos e faturas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Outreach: mensagens automáticas e sequências").length).toBeGreaterThan(0);
  });

  it("o artigo renderiza o passo a passo", async () => {
    renderAt("/docs/chat");
    expect(await screen.findByText("Devolver Controle ao Agente", { exact: false })).toBeTruthy();
  });

  it("slug inexistente mostra estado vazio com volta ao índice", async () => {
    renderAt("/docs/nao-existe");
    expect(await screen.findByText("Artigo não encontrado")).toBeTruthy();
    expect(screen.getByText("Voltar à Central de Ajuda")).toBeTruthy();
  });

  it("/tutorial redireciona para /docs sem link quebrado", async () => {
    renderAt("/tutorial");
    expect(await screen.findByText("Por onde começar?")).toBeTruthy();
  });
});
