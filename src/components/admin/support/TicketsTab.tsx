import { SupportTickets } from "@/components/support/SupportTickets";
import { useRole } from "@/hooks/useRole";

/**
 * Aba de tickets do painel Admin. Só o administrador geral (super_admin) opera
 * o atendimento de todos os tenants — `owner` é o dono do time (cliente) e vê
 * apenas os próprios tickets pela tela /suporte.
 */
export function TicketsTab() {
  const { isSuperAdmin, loadingRole } = useRole();
  if (loadingRole) return <p role="status">Verificando acesso…</p>;
  if (!isSuperAdmin()) return <p>Acesso restrito à administração geral.</p>;
  return <SupportTickets admin />;
}
