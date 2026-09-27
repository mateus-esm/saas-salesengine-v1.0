import { SupportTickets } from "@/components/support/SupportTickets";
import { useRole } from "@/hooks/useRole";

export function TicketsTab() {
  const { isOwner, loadingRole } = useRole();
  if (loadingRole) return <p role="status">Verificando acesso…</p>;
  if (!isOwner()) return <p>Acesso restrito à administração do suporte.</p>;
  return <SupportTickets admin />;
}
