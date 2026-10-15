// Sprint Suporte 1 · #8/#11 — "Responsável / Atendente" no painel do chat.
// Dois seletores inline, dois papéis: o dono da conta/negócio e quem está na
// conversa. Apresentacional: quem grava é o CRMContextPanel (useSetResponsible /
// useSetAttendant).

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Member } from "@/hooks/useMemberDirectory";
import type { ChatOwnership } from "@/lib/chatOwnership";

const NONE = "__none__";

interface Props {
  ownership: ChatOwnership;
  members: Member[];
  onSetResponsible?: (userId: string | null) => void;
  onSetAttendant?: (userId: string | null) => void;
  disabled?: boolean;
}

function Row({
  label,
  hint,
  slot,
  members,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  slot: ChatOwnership["responsible"];
  members: Member[];
  onChange?: (userId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2" title={hint}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      {onChange ? (
        <Select
          value={slot.id ?? NONE}
          onValueChange={(v) => onChange(v === NONE ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 w-[150px] text-xs px-2" aria-label={label}>
            <SelectValue>{slot.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Ninguém</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs truncate">{slot.label}</span>
      )}
    </div>
  );
}

export function ChatOwnershipBlock({ ownership, members, onSetResponsible, onSetAttendant, disabled }: Props) {
  return (
    <div className="space-y-1.5" data-testid="chat-ownership">
      <Row
        label="Responsável"
        hint="Dono da conta e dos negócios abertos deste contato"
        slot={ownership.responsible}
        members={members}
        onChange={onSetResponsible}
        disabled={disabled}
      />
      <Row
        label="Atendente"
        hint="Quem está atendendo esta conversa"
        slot={ownership.attendant}
        members={members}
        onChange={onSetAttendant}
        disabled={disabled}
      />
    </div>
  );
}
