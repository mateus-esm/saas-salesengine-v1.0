// Sprint 8.2 · discovery_q&a — uma pergunta, um controle.
//
// O tipo vem do banco de perguntas, então este componente é a única tradução
// entre "o que a pergunta é" e "o que a pessoa vê". Nenhuma tela conhece uma
// pergunta específica: mudar o texto de uma pergunta é um UPDATE, não um deploy.

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DiscoveryQuestion } from "@/lib/discovery/types";

interface Props {
  question: DiscoveryQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid?: boolean;
  /** Veio de um JSON colado: fica marcado até a pessoa olhar. */
  imported?: boolean;
}

export function QuestionField({ question, value, onChange, invalid, imported }: Props) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const atLimit = !!question.max_select && selected.length >= question.max_select;

  const text = typeof value === "string" ? value : "";
  const known = question.options.map((o) => o.value);

  // "Outro" é derivado da resposta, não de estado local: se fosse estado, o
  // JSON colado preencheria o campo e o rádio continuaria em branco, porque
  // colar não remonta o componente.
  const isOther = question.type === "select_other" && text !== "" && !known.includes(text);

  return (
    <div id={`q-${question.code}`} className="space-y-2 scroll-mt-24">
      <Label className={cn("text-sm font-medium leading-snug", invalid && "text-destructive")}>
        {question.label}
        {question.required && <span className="text-muted-foreground"> *</span>}
      </Label>

      {question.help && <p className="text-xs text-muted-foreground">{question.help}</p>}

      {imported && <p className="text-xs text-primary">Preenchido pelo JSON — vale conferir.</p>}

      {question.type === "text" && (
        <Input value={text} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "textarea" && (
        <Textarea rows={4} value={text} onChange={(e) => onChange(e.target.value)} />
      )}

      {question.type === "select" && (
        <RadioGroup value={text} onValueChange={onChange}>
          {question.options.map((option) => (
            <div key={option.value} className="flex items-start gap-2">
              <RadioGroupItem value={option.value} id={`${question.code}-${option.value}`} className="mt-0.5" />
              <Label htmlFor={`${question.code}-${option.value}`} className="text-sm font-normal leading-snug">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {question.type === "select_other" && (
        <div className="space-y-2">
          <RadioGroup
            value={isOther ? "__outro__" : text}
            // Escolher "Outro" grava um espaço: é o que marca "escolheu outro e
            // ainda não escreveu". String vazia voltaria o rádio para o nada, e
            // um espaço não conta como resposta (hasAnswer apara antes de medir),
            // então o progresso não sobe por um campo em branco.
            onValueChange={(v) => onChange(v === "__outro__" ? " " : v)}
          >
            {question.options.map((option) => (
              <div key={option.value} className="flex items-start gap-2">
                <RadioGroupItem value={option.value} id={`${question.code}-${option.value}`} className="mt-0.5" />
                <Label htmlFor={`${question.code}-${option.value}`} className="text-sm font-normal leading-snug">
                  {option.label}
                </Label>
              </div>
            ))}
            <div className="flex items-start gap-2">
              <RadioGroupItem value="__outro__" id={`${question.code}-outro`} className="mt-0.5" />
              <Label htmlFor={`${question.code}-outro`} className="text-sm font-normal">
                Outro — eu escrevo
              </Label>
            </div>
          </RadioGroup>
          {isOther && (
            <Textarea rows={3} value={text} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
      )}

      {question.type === "multi" && (
        <div className="space-y-2">
          {question.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <div key={option.value} className="flex items-start gap-2">
                <Checkbox
                  id={`${question.code}-${option.value}`}
                  checked={checked}
                  // O teto desabilita o que ainda não foi marcado, em vez de
                  // aceitar o clique e descartá-lo em silêncio. O que já está
                  // marcado continua clicável, senão não haveria como trocar.
                  disabled={!checked && atLimit}
                  onCheckedChange={(next) =>
                    onChange(next ? [...selected, option.value] : selected.filter((v) => v !== option.value))
                  }
                  className="mt-0.5"
                />
                <Label htmlFor={`${question.code}-${option.value}`} className="text-sm font-normal leading-snug">
                  {option.label}
                </Label>
              </div>
            );
          })}
          {question.max_select && (
            <p className="text-xs text-muted-foreground">
              Até {question.max_select} — {selected.length} escolhido(s).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
