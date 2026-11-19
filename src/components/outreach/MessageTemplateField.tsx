import { WhatsAppComposer } from "./WhatsAppComposer";
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
const variables = MESSAGE_VARIABLES.map((v) => ({
  ...v,
  tokenLabel: "{{" + v.key + "}}",
}));
export function MessageTemplateField({ tenantName, ...props }: Props) {
  const problems = templateProblems(props.value);
  return (
    <WhatsAppComposer
      {...props}
      variables={variables}
      preview={renderPreview(props.value, { ...SAMPLE_LEAD, tenantName })}
      previewLabel={`Prévia no WhatsApp · Exemplo com ${SAMPLE_LEAD.leadName}`}
      errors={problems.length
        ? (
          <ul role="alert" className="text-xs text-destructive">
            {problems.map((p) => (
              <li key={JSON.stringify(p)}>{describeProblem(p)}</li>
            ))}
          </ul>
        )
        : undefined}
    />
  );
}
