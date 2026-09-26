// SE-REV-005 — campo de mensagem com as variáveis à vista.
//
// Usado nos dois lugares onde se escreve mensagem na tela de Outreach: a
// mensagem de abertura e o texto de cada passo da sequência. Mostra as
// variáveis que existem (clicar insere no cursor), aponta a variável que não
// existe — antes ela virava texto em branco no WhatsApp sem aviso — e mostra
// como a mensagem sai para um lead de exemplo.
import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  describeProblem,
  MESSAGE_VARIABLES,
  renderPreview,
  SAMPLE_LEAD,
  templateProblems,
} from "@/lib/message-variables";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  tenantName: string;
  placeholder?: string;
  rows?: number;
};

export function MessageTemplateField({ id, value, onChange, tenantName, placeholder, rows = 3 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const problems = templateProblems(value);
  const preview = renderPreview(value, { ...SAMPLE_LEAD, tenantName });

  const insert = (key: string) => {
    const token = `{{${key}}}`;
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={problems.length > 0}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1" data-testid={`${id}-variables`}>
        <span className="text-xs text-muted-foreground">Variáveis:</span>
        {MESSAGE_VARIABLES.map((variable) => (
          <Button
            key={variable.key}
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 font-mono text-xs"
            title={`${variable.label} — clique para inserir`}
            onClick={() => insert(variable.key)}
          >
            {`{{${variable.key}}}`}
          </Button>
        ))}
      </div>
      {problems.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive" role="alert">
          {problems.map((problem) => (
            <li key={JSON.stringify(problem)} className="flex items-start gap-1">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {describeProblem(problem)}
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm" data-testid={`${id}-preview`}>
          <span className="block text-xs text-muted-foreground">
            Como sai para um lead de exemplo ({SAMPLE_LEAD.leadName}, origem {SAMPLE_LEAD.leadSource}):
          </span>
          {preview}
        </div>
      )}
    </div>
  );
}
