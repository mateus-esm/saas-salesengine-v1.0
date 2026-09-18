// Sprint 8.2 · discovery_q&a — o discovery dentro do card.
//
// O que o fundador precisa ver antes de entrar na reunião: quanto já foi
// respondido, o que o cliente escreveu, e um jeito de reenviar o link.
//
// O briefing é o que fecha o ciclo — sem ele o formulário só encurtou a reunião,
// e montar o ambiente continua sendo reler resposta e digitar em outra tela.

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { groupIntoBlocks, hasAnswer } from "@/lib/discovery/evaluate";
import { buildBriefing } from "@/lib/discovery/briefing";
import type { QuestionOption } from "@/lib/discovery/types";
import {
  useDiscoveryAnswers, useDiscoveryQuestions, useEnsureDiscoveryLink,
} from "@/hooks/useDiscoveryAdmin";

interface Props {
  onboardingId: string;
  /** Só o briefing usa: é o cabeçalho do texto de treino do agente. */
  clienteNome: string;
}

export function DiscoveryPanel({ onboardingId, clienteNome }: Props) {
  const { data: questions = [] } = useDiscoveryQuestions();
  const { data: record, isLoading } = useDiscoveryAnswers(onboardingId);
  const ensure = useEnsureDiscoveryLink();

  const blocks = useMemo(() => groupIntoBlocks(questions), [questions]);

  const copiarLink = async () => {
    try {
      const url = await ensure.mutateAsync(onboardingId);
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado. O link anterior deixou de valer; as respostas continuam.");
    } catch {
      toast.error("Não conseguimos gerar o link.");
    }
  };

  const copiarBriefing = async () => {
    if (!record) return;
    const { agentText, checklist } = buildBriefing(questions, record.answers, clienteNome);
    const texto = [
      agentText,
      "",
      "Checklist de configuração",
      ...checklist.map((i) => `[${i.group}] ${i.label}: ${i.answer}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Briefing copiado.");
    } catch {
      toast.error("Não conseguimos copiar o briefing.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Discovery</h3>
        <div className="flex gap-2">
          {record && (
            <Button variant="outline" size="sm" onClick={copiarBriefing}>
              Copiar briefing
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copiarLink} disabled={ensure.isPending}>
            {record ? "Gerar novo link" : "Gerar link"}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {!isLoading && !record && (
        <p className="text-xs text-muted-foreground">
          Ainda não enviado. Gere o link para mandar ao cliente.
        </p>
      )}

      {record && (
        <>
          <div className="space-y-1">
            <Progress value={record.progress} />
            <p className="text-xs text-muted-foreground">
              {record.progress}% respondido
              {record.status === "submitted" ? " · enviado" : " · em preenchimento"}
            </p>
          </div>

          <div className="space-y-4">
            {blocks.map((block) => {
              const answered = block.questions.filter((q) => hasAnswer(q, record.answers[q.code]));
              if (answered.length === 0) return null;
              return (
                <div key={block.id} className="space-y-2">
                  <Badge variant="secondary" className="text-[10px]">{block.label}</Badge>
                  {answered.map((question) => (
                    <div key={question.code} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{question.label}</p>
                      <p className="text-sm whitespace-pre-wrap">
                        {formatAnswer(question.options, record.answers[question.code])}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Mostra o rótulo da opção, não o slug: "Preço" em vez de "preco". */
function formatAnswer(options: QuestionOption[], value: unknown): string {
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(", ");
  return label(String(value ?? ""));
}
