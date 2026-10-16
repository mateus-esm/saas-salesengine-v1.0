// SE-SUP1-4 (#9) — nome digitado pelo time não é desfeito pelo pushName do
// WhatsApp nem pela IA. Toda edição de contato que muda `name` liga
// leads.name_locked; o gatilho do banco (20261015000300) garante o mesmo para
// qualquer escritor com sessão de usuário, e isto deixa a intenção explícita
// nos caminhos de edição da UI.
export function withNameLock<T extends object>(patch: T): T & { name_locked?: true } {
  const name = (patch as { name?: unknown }).name;
  if (typeof name === "string" && name.trim() !== "") {
    return { ...patch, name_locked: true };
  }
  return patch;
}
