/**
 * Sprint 11 · Onda 4 · T45 — the public form of a record ("Dados para Contrato").
 *
 * Public, no login: the client got a link from the seller and fills their own
 * data. It reads top to bottom on a phone. The fields and their current values
 * come from the `public-form` edge function (service role, only what the form
 * shows); each field is validated again on the server, which names the field to
 * fix. The link works until the form is sent, or for 30 days.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { DynamicFieldRenderer, validateCustomData } from "@/components/crm/DynamicFieldRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { publicFormErrorText } from "@/lib/publicForm";
import type { CustomFieldSchema, CustomFieldType } from "@/types/pipelines";

interface PublicFormField {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  value: unknown;
}

interface PublicFormData {
  team: string | null;
  title: string;
  intro: string;
  fields: PublicFormField[];
}

type Answer = { form?: PublicFormData; ok?: boolean; error?: string; field?: string };

/** invoke() turns a non-2xx into an error; the body still says which. */
async function call(body: Record<string, unknown>): Promise<Answer> {
  const { data, error } = await supabase.functions.invoke("public-form", { body });
  if (data) return data as Answer;
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === "function") {
    try {
      return (await context.json()) as Answer;
    } catch {
      // fall through
    }
  }
  return { error: "internal_error" };
}

export default function PublicForm() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ok" | "gone" | "sent">("loading");
  const [goneReason, setGoneReason] = useState<string | undefined>();
  const [form, setForm] = useState<PublicFormData | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = await call({ action: "get", token });
      if (cancelled) return;
      if (answer.form) {
        setForm(answer.form);
        setValues(Object.fromEntries(answer.form.fields.map((f) => [f.key, f.value ?? null])));
        setState("ok");
      } else {
        setGoneReason(answer.error);
        setState("gone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The renderer addresses by field_id; on the public side the key plays it.
  const schema: CustomFieldSchema[] = useMemo(
    () =>
      (form?.fields ?? []).map((f, i) => ({
        field_id: f.key,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        position: i,
      })),
    [form],
  );

  const submit = async () => {
    const errors = validateCustomData(schema, values);
    if (errors.length > 0) {
      setProblem(errors[0].message);
      return;
    }
    setSending(true);
    setProblem(null);
    const answer = await call({ action: "submit", token, values });
    setSending(false);
    if (answer.ok) {
      setState("sent");
      return;
    }
    if (answer.error === "form_submitted" || answer.error === "form_expired" || answer.error === "form_revoked") {
      setGoneReason(answer.error);
      setState("gone");
      return;
    }
    const label = form?.fields.find((f) => f.key === answer.field)?.label;
    setProblem(publicFormErrorText(answer.error, label));
  };

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (state === "gone" || state === "sent" || !form) {
    const sent = state === "sent";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          {sent ? (
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-600" />
          ) : (
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          )}
          <h1 className="text-base font-semibold text-foreground">
            {sent ? "Recebemos seus dados. Obrigado!" : publicFormErrorText(goneReason)}
          </h1>
          {sent && form?.team && (
            <p className="mt-1.5 text-xs text-muted-foreground">A equipe da {form.team} segue a partir daqui.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <header className="mb-5">
          {form.team && <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{form.team}</p>}
          <h1 className="mt-1 text-xl font-semibold text-foreground">{form.title}</h1>
          {form.intro && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{form.intro}</p>}
        </header>

        <Card className="space-y-5 p-5">
          <DynamicFieldRenderer schema={schema} value={values} onChange={setValues} disabled={sending} />
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          <Button className="w-full" onClick={() => void submit()} disabled={sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar
          </Button>
        </Card>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Seus dados vão direto para a equipe que enviou este link.
        </p>
      </div>
    </div>
  );
}
