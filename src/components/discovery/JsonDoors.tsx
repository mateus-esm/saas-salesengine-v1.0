// Sprint 8.2 · discovery_q&a — as duas portas de JSON.
//
// Copiar as perguntas, responder na IA da casa do cliente, colar de volta. A
// volta entra como RASCUNHO destacado: nada é enviado sem alguém confirmar.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { buildQuestionExport, parseAnswerImport } from "@/lib/discovery/jsonRoundTrip";
import type { DiscoveryAnswers, DiscoveryQuestion } from "@/lib/discovery/types";

const MENSAGEM_ERRO: Record<string, string> = {
  json_invalido: "Isso não é um JSON válido. Copie de novo a resposta inteira da sua IA.",
  formato_invalido: "O JSON precisa ser um objeto com as respostas.",
  nenhuma_resposta: "Nenhuma resposta reconhecida. Confira se os códigos das perguntas vieram junto.",
};

interface Props {
  questions: DiscoveryQuestion[];
  onImport: (answers: DiscoveryAnswers, imported: string[]) => void;
}

export function JsonDoors({ questions, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildQuestionExport(questions), null, 2));
      toast.success("Perguntas copiadas. Cole na sua IA e traga a resposta de volta.");
    } catch {
      toast.error("Seu navegador bloqueou a cópia. Selecione o texto e copie à mão.");
    }
  };

  const colar = () => {
    const result = parseAnswerImport(questions, raw);
    if ("error" in result) {
      toast.error(MENSAGEM_ERRO[result.error]);
      return;
    }
    onImport(result.answers, result.imported);
    setOpen(false);
    setRaw("");
    toast.success(
      result.ignored.length
        ? `${result.imported.length} respostas preenchidas. ${result.ignored.length} foram ignoradas por não bater com as perguntas.`
        : `${result.imported.length} respostas preenchidas. Confira antes de enviar.`,
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copiar}>
        Copiar perguntas (JSON)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">Colar respostas (JSON)</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Colar respostas</DialogTitle>
            <DialogDescription>
              Cole o JSON que a sua IA devolveu. As respostas entram no formulário destacadas,
              para você conferir — nada é enviado antes de você revisar.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={12}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='{"respostas": { ... }}'
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button type="button" onClick={colar} disabled={!raw.trim()}>
              Preencher o formulário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
