import * as React from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Campo de texto com rascunho local.
 *
 * Existe por causa do lag de digitação em Pipelines → Config → Etapas: o input
 * era controlado direto pelo valor do servidor e cada tecla chamava
 * `updateStage.mutate(...)`, ou seja, um UPDATE no banco por caractere — e o
 * caractere só aparecia depois do round-trip.
 *
 * Aqui o texto digitado vive em estado local e sobe para o servidor de uma vez,
 * no blur (sair do campo) ou no Enter. O valor vindo de fora (refetch, realtime,
 * troca de pipeline) continua mandando: enquanto o campo não está em edição ele
 * ressincroniza o rascunho.
 *
 * Mesmo padrão já usado na edição de células do grid (`grid/InlineCell.tsx`,
 * TextEditor): estado local + commit no blur.
 */
interface DraftFieldProps {
  /** Valor persistido que veio do servidor. */
  value: string;
  /** Chamado uma vez ao sair do campo, e só se o texto tiver mudado. */
  onCommit: (next: string) => void;
  /** Renderiza um <Textarea> em vez de um <Input>. */
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  // Mesmo tipo que o <Input> do repo aceita (`ui/input.tsx` usa
  // React.ComponentProps<"input">) — assim não depende de alias avulso.
  type?: React.ComponentProps<"input">["type"];
  rows?: number;
}

export const DraftField = ({
  value,
  onCommit,
  multiline = false,
  className,
  placeholder,
  "aria-label": ariaLabel,
  type = "text",
  rows,
}: DraftFieldProps) => {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    dirty.current = true;
    setDraft(e.target.value);
  };

  const handleFocus = () => {
    editing.current = true;
    dirty.current = false;
  };

  const handleBlur = () => {
    editing.current = false;
    if (!dirty.current) {
      // Ninguém digitou: se o servidor mudou por baixo, adota o valor novo em
      // vez de gravar o antigo de volta.
      if (draft !== server.current) setDraft(server.current);
      return;
    }
    if (draft !== server.current) onCommit(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Enter sai do campo; é o blur acima que persiste. Em textarea o Enter é
    // quebra de linha e continua sendo.
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  if (multiline) {
    return (
      <Textarea
        value={draft}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={rows}
        className={className}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <Input
      value={draft}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      type={type}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
};
