// Sprint 8.2 · discovery_q&a — o discovery que o cliente preenche antes da reunião.
//
// Um bloco por vez, com o que já sabemos marcado: o cliente CORRIGE em vez de
// redigir. Autosave a cada troca de bloco — quem fecha a aba no meio volta onde
// parou, e um formulário de 15 minutos sem autosave é um formulário abandonado.
//
// O link do Calendly só aparece na tela final. Um pedido por vez: a mensagem de
// boas-vindas pede o discovery, e a reunião é o que vem depois de terminá-lo.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/config/brand";
import { JsonDoors } from "@/components/discovery/JsonDoors";
import { QuestionField } from "@/components/discovery/QuestionField";
import { evaluateDiscovery, groupIntoBlocks, withDefaults } from "@/lib/discovery/evaluate";
import type { DiscoveryAnswers } from "@/lib/discovery/types";
import {
  useDiscoveryDocument, useSaveDiscovery, useSubmitDiscovery,
} from "@/hooks/usePublicDiscovery";
import { toast } from "sonner";

const RECUSA: Record<string, string> = {
  discovery_not_found: "Esse link não existe. Confira o endereço ou peça um novo.",
  discovery_expired: "Esse link expirou. Peça um novo para a gente.",
  discovery_submitted: "Esse discovery já foi enviado. Obrigado!",
};

export default function PublicDiscovery() {
  const { token = "" } = useParams();
  const { data, isLoading, error } = useDiscoveryDocument(token);
  const save = useSaveDiscovery(token);
  const submit = useSubmitDiscovery(token);

  const [answers, setAnswers] = useState<DiscoveryAnswers>({});
  const [imported, setImported] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Os padrões entram UMA vez, quando o documento chega. Reaplicá-los a cada
  // render desfaria o que a pessoa acabou de desmarcar.
  useEffect(() => {
    if (!data || loaded) return;
    setAnswers(withDefaults(data.questions, data.answers));
    setLoaded(true);
  }, [data, loaded]);

  const blocks = useMemo(() => (data ? groupIntoBlocks(data.questions) : []), [data]);
  const evaluation = useMemo(
    () => (data ? evaluateDiscovery(data.questions, answers) : null),
    [data, answers],
  );

  if (isLoading) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <p className="text-muted-foreground">Carregando…</p>
        </div>
      </Shell>
    );
  }

  if (error) {
    const code = (error as { error?: string }).error ?? "";
    return (
      <Shell>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <p className="text-muted-foreground">
            {RECUSA[code] ?? "Não conseguimos abrir esse discovery."}
          </p>
        </div>
      </Shell>
    );
  }

  if (!data || !evaluation) return null;
  if (data.status === "submitted") return <Done nome={data.cliente_nome} agenda={data.link_agenda} />;

  const block = blocks[step];
  if (!block) return null;
  const last = step === blocks.length - 1;

  const avancar = async () => {
    try {
      await save.mutateAsync(answers);
    } catch {
      toast.error("Não conseguimos salvar. Tente de novo.");
      return;
    }

    if (!last) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }

    // No último bloco o envio é o botão. Se algo ficou para trás, leva a pessoa
    // ATÉ o campo em vez de só recusar: "falta preencher" sem dizer onde é o
    // que faz alguém fechar a aba.
    if (!evaluation.complete) {
      const first = evaluation.missing[0];
      toast.error(`Falta responder: ${first.label}`);
      const target = blocks.findIndex((b) => b.questions.some((q) => q.code === first.code));
      setStep(target >= 0 ? target : 0);
      requestAnimationFrame(() =>
        document.getElementById(`q-${first.code}`)?.scrollIntoView({ block: "center" }),
      );
      return;
    }

    try {
      await submit.mutateAsync();
    } catch {
      toast.error("Não conseguimos enviar. Tente de novo.");
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {data.cliente_nome} · {BRAND.product}
          </p>
          <h1 className="text-2xl font-semibold">Antes da nossa reunião</h1>
          <p className="text-sm text-muted-foreground">
            São {data.questions.length} perguntas sobre a sua operação — a maioria já vem com uma
            sugestão marcada, é só corrigir o que não bate. Leva de 12 a 15 minutos, e é com isso
            que montamos seu agente e seu CRM antes de a gente se falar. Se algo ainda não estiver
            definido, escreva "a confirmar".
          </p>
        </div>

        <JsonDoors
          questions={data.questions}
          onImport={(incoming, codes) => {
            setAnswers((old) => ({ ...old, ...incoming }));
            setImported(codes);
          }}
        />

        <div className="space-y-2">
          <Progress value={evaluation.percent} />
          <p className="text-xs text-muted-foreground">
            Bloco {step + 1} de {blocks.length} · {block.label} · {evaluation.percent}% respondido
          </p>
        </div>

        <Card>
          <CardContent className="space-y-6 pt-6">
            {block.questions.map((question) => (
              <QuestionField
                key={question.code}
                question={question}
                value={answers[question.code]}
                imported={imported.includes(question.code)}
                onChange={(value) => setAnswers((old) => ({ ...old, [question.code]: value }))}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
          <Button onClick={avancar} disabled={save.isPending || submit.isPending}>
            {last ? "Enviar e escolher o horário" : "Salvar e continuar"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Logo className="h-7" />
        </div>
      </header>
      {children}
    </div>
  );
}

/** A tela final é onde o agendamento aparece — a reunião é o prêmio por terminar. */
function Done({ nome, agenda }: { nome: string; agenda: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Recebemos, {nome}. Obrigado!</h1>
        <p className="text-muted-foreground">
          Com isso a gente já monta seu agente e seu CRM. Agora escolha o melhor horário para a
          nossa reunião — ela vai ser para decidir, não para preencher formulário.
        </p>
        {agenda && (
          <Button asChild size="lg">
            <a href={agenda} target="_blank" rel="noreferrer">Escolher o horário</a>
          </Button>
        )}
      </div>
    </Shell>
  );
}
