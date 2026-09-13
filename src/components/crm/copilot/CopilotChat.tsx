import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Loader2, RotateCcw, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCopilotChat, type ChatTurn } from "@/hooks/useCopilotChat";
import { CHAT_SUGGESTIONS, groupBlocks, renderBlocks, type Span } from "@/lib/copilotChat";
import { cn } from "@/lib/utils";

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.href ? (
          s.href.startsWith("/") ? (
            <Link key={i} to={s.href} className="font-medium text-primary underline underline-offset-2">
              {s.text}
            </Link>
          ) : (
            <a key={i} href={s.href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
              {s.text}
            </a>
          )
        ) : s.bold ? (
          <strong key={i}>{s.text}</strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Answer({ turn }: { turn: ChatTurn }) {
  const groups = groupBlocks(renderBlocks(turn.content));
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {turn.tools && turn.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {turn.tools.map((t) => (
            <span key={t.name} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              <Search className="h-3 w-3" />
              {t.label}
            </span>
          ))}
        </div>
      )}
      {turn.pending && !turn.content && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {turn.tools?.length ? "Consultando…" : "Pensando…"}
        </p>
      )}
      {groups.map((g, i) =>
        g.kind === "p" ? (
          <p key={i} className={cn(turn.error && "text-destructive")}>
            <Spans spans={g.spans} />
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {g.items.map((spans, j) => (
              <li key={j}>
                <Spans spans={spans} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/**
 * Sprint 11 · Onda 6 · T64 — "Entenda como está sua máquina de receita".
 * Sprint 11 · T68 — the app's opening: before the first question, the greeting,
 * one big field and the suggestions, centered; then the conversation grows in
 * place above the field (the modules stay below it on the home).
 *
 * The question goes to the Copilot's chat (read-only: the dashboard's numbers,
 * campaigns, placar, deals, where to focus — under the user's own permissions);
 * the answer streams in, with the queries it made as chips and links to the
 * screens the numbers came from.
 */
export function CopilotChat({ greeting, footer }: { greeting?: string; footer?: ReactNode }) {
  const { turns, sending, send, reset } = useCopilotChat();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const opening = turns.length === 0;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns]);

  const submit = (text: string) => {
    if (!text.trim() || sending) return;
    void send(text);
    setDraft("");
  };

  return (
    <section className="w-full">
      {opening ? (
        <div className="mb-6 text-center">
          {greeting && <p className="text-lg text-muted-foreground">{greeting}</p>}
          <h2 className="mt-1 flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Sparkles className="h-6 w-6 shrink-0 text-primary" />
            Entenda como está sua máquina de receita
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">Os números vêm do seu CRM, com o que você pode ver.</p>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Entenda como está sua máquina de receita
          </h2>
          <Button variant="ghost" size="sm" onClick={reset} className="shrink-0 text-xs">
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Nova conversa
          </Button>
        </div>
      )}

      {!opening && (
        <div ref={listRef} className="mb-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((turn) =>
            turn.role === "user" ? (
              <div key={turn.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.content}</p>
              </div>
            ) : (
              <div key={turn.id} className="max-w-[95%]">
                <Answer turn={turn} />
              </div>
            ),
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="relative"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Pergunte ao Copilot… (ex.: quantos leads entraram hoje?)"
          rows={opening ? 3 : 2}
          maxLength={2000}
          className="resize-none rounded-2xl bg-background pr-14 shadow-sm"
          aria-label="Pergunta para o Copilot"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim() || sending}
          className="absolute bottom-2.5 right-2.5 h-9 w-9 rounded-full"
          aria-label="Perguntar"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </form>

      {opening && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {CHAT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {footer && <div className="mt-5 flex justify-center">{footer}</div>}
    </section>
  );
}
