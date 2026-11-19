import { Fragment, type ReactNode, useRef } from "react";
import { Bold, Code, Italic, List, Quote, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Variable = { key: string; label: string; tokenLabel?: string };
type Props = {
  id: string;
  value: string;
  onChange: (text: string) => void;
  preview: string;
  variables: readonly Variable[];
  previewLabel: string;
  placeholder?: string;
  rows?: number;
  errors?: ReactNode;
};

function inline(text: string, depth = 0): ReactNode {
  if (depth > 3) return text;
  const result: ReactNode[] = [];
  const parts =
    /https?:\/\/[^\s]+|(?<![\p{L}\p{N}])([*_~`])(?!\s)(.+?)(?<!\s)\1(?![\p{L}\p{N}])/gu;
  let end = 0;
  for (const match of text.matchAll(parts)) {
    const index = match.index!;
    result.push(text.slice(end, index));
    if (!match[1]) {
      result.push(
        <span key={index} className="text-blue-700 underline">{match[0]}</span>,
      );
    } else {
      const Tag =
        ({ "*": "strong", "_": "em", "~": "del", "`": "code" } as const)[
          match[1] as "*" | "_" | "~" | "`"
        ];
      result.push(
        <Tag key={index}>
          {Tag === "code" ? match[2] : inline(match[2], depth + 1)}
        </Tag>,
      );
    }
    end = index + match[0].length;
  }
  return [...result, text.slice(end)];
}

export function WhatsAppComposer(
  {
    id,
    value,
    onChange,
    preview,
    variables,
    previewLabel,
    placeholder,
    rows = 5,
    errors,
  }: Props,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function insert(before: string, after = "", block = false) {
    const start = ref.current?.selectionStart ?? value.length;
    const end = ref.current?.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const head = value.slice(0, start);
    const prefix = block && head && !head.endsWith("\n") ? "\n" : "";
    const replacement = block
      ? selected.split("\n").map((line) => before + line).join("\n")
      : before + selected + after;
    const pos = start + prefix.length + before.length;
    onChange(head + prefix + replacement + value.slice(end));
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos + selected.length);
    });
  }
  function variable(key: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const token = "{{" + key + "}}";
    onChange(
      value.slice(0, start) + token + value.slice(el?.selectionEnd ?? start),
    );
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return (
    <div className="space-y-2">
      <div
        role="toolbar"
        aria-label="Formatação WhatsApp"
        className="flex flex-wrap gap-1"
      >
        {[
          { name: "Negrito", mark: "*", Icon: Bold },
          { name: "Itálico", mark: "_", Icon: Italic },
          { name: "Tachado", mark: "~", Icon: Strikethrough },
          { name: "Código", mark: "`", Icon: Code },
          { name: "Lista", mark: "- ", Icon: List, block: true },
          { name: "Citação", mark: "> ", Icon: Quote, block: true },
        ].map(({ name, mark, Icon, block }) => (
          <Button
            key={name}
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            title={name}
            aria-label={name}
            onClick={() => insert(mark, block ? "" : mark, block)}
          >
            <Icon className="size-4" />
          </Button>
        ))}
      </div>
      <Textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        aria-invalid={!!errors}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div data-testid={id + "-variables"} className="flex flex-wrap gap-1">
        {variables.map((v) => (
          <Button
            key={v.key}
            type="button"
            size="sm"
            variant="outline"
            title={v.label}
            onClick={() => variable(v.key)}
          >
            {v.tokenLabel ?? v.label}
          </Button>
        ))}
      </div>
      {errors}
      {preview && (
        <div data-testid={id + "-preview"} className="rounded-lg bg-muted p-3">
          <p className="mb-2 text-xs text-muted-foreground">{previewLabel}</p>
          <div className="w-fit max-w-full whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-sm shadow-sm">
            {preview.split("\n").map((line, i) => (
              <Fragment key={i}>
                {i > 0 && "\n"}
                {line.startsWith("> ")
                  ? (
                    <span className="border-l-2 border-muted-foreground pl-2">
                      {inline(line.slice(2))}
                    </span>
                  )
                  : inline(line.replace(/^[-*] /, "• "))}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
