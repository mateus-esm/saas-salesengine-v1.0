// SE-FIX-001 — rascunho local de campo de texto (ver DraftField.tsx).
import * as React from "react";

/**
 * A regra do rascunho, separada da renderização para servir também a campos
 * compostos (o MessageTemplateField do Reciclo: textarea + botões de variável).
 *
 * - `change` só mexe no estado local;
 * - `begin` marca o início de uma edição (idempotente: em um campo composto o
 *   foco passa do texto para um botão sem a edição acabar);
 * - não há "Escape cancela": sair do campo, por qualquer caminho, é o commit;
 * - `end` encerra a edição e chama `onCommit` uma vez, só se o usuário digitou
 *   e o texto final difere do último valor do servidor.
 */
export function useDraftValue(value: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = React.useState(value);
  // Só o campo em edição pode segurar texto não persistido; fora dele quem
  // manda é o valor do servidor.
  const editing = React.useRef(false);
  // O usuário chegou a digitar nesta sessão de edição? Sem isto, sair do campo
  // logo depois de o servidor mandar um valor novo gravaria o texto velho de
  // volta por cima do novo.
  const dirty = React.useRef(false);
  // Último valor do servidor visto, mesmo durante a edição (o `value` do render
  // fica defasado enquanto o rascunho segura o texto do usuário).
  const server = React.useRef(value);

  // Reflete no rascunho qualquer valor novo que chegue do servidor — salvo
  // enquanto o usuário está digitando, para não apagar o que ele escreveu.
  React.useEffect(() => {
    server.current = value;
    if (!editing.current) setDraft(value);
  }, [value]);

  const change = (next: string) => {
    // Uma mudança é sempre uma edição em curso, mesmo sem foco registrado (ex.:
    // botão de variável clicado no Safari, que não foca botões): o valor do
    // servidor não pode apagá-la antes do commit.
    editing.current = true;
    dirty.current = true;
    setDraft(next);
  };

  const begin = () => {
    // `dirty` só zera em `end` (depois do commit), para que reentrar no campo
    // não descarte uma mudança ainda não gravada.
    editing.current = true;
  };

  const end = () => {
    editing.current = false;
    if (!dirty.current) {
      // Ninguém digitou: se o servidor mudou por baixo, adota o valor novo em
      // vez de gravar o antigo de volta.
      if (draft !== server.current) setDraft(server.current);
      return;
    }
    dirty.current = false;
    if (draft !== server.current) onCommit(draft);
  };

  return { draft, change, begin, end };
}
