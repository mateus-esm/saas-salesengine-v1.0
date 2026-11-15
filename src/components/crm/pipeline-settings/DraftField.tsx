import * as React from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useDraftValue } from "./useDraftValue";

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
  const { draft, change, begin, end } = useDraftValue(value, onCommit);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    change(e.target.value);
  const handleFocus = begin;
  const handleBlur = end;

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
