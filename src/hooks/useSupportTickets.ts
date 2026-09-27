import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SupportTicket = Database["public"]["Tables"]["support_tickets"]["Row"];
export type TicketStatus = SupportTicket["status"];
export const TICKET_STATUS: Record<TicketStatus, string> = {
  aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido", fechado: "Fechado",
};
export const TICKET_PAGE_SIZE = 25;

export function useSupportTickets(admin: boolean, status: string, team: string, page: number, ticketId: string | null) {
  const { user, equipe } = useAuth();
  const qc = useQueryClient();
  // A chave inclui a identidade e o escopo para não reutilizar dados de outra sessão.
  const scope = [user?.id, admin ? "admin" : equipe?.id];
  const enabled = !!user && (admin || !!equipe);
  const tickets = useQuery({
    queryKey: ["support", ...scope, "tickets", status, team, page],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      let query = supabase.from("support_tickets").select("*", { count: "exact" })
        .order("created_at", { ascending: false }).order("id");
      if (!admin) query = query.eq("equipe_id", equipe!.id);
      else if (team !== "todos") query = query.eq("equipe_id", team);
      if (status !== "todos") query = query.eq("status", status as TicketStatus);
      const { data, error, count } = await query.range(page * TICKET_PAGE_SIZE, (page + 1) * TICKET_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  const teams = useQuery({
    queryKey: ["support", ...scope, "teams"],
    enabled: enabled && admin,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("support_ticket_teams");
      if (error) throw error;
      return data ?? [];
    },
  });
  const ticket = useQuery({
    queryKey: ["support", ...scope, "ticket", ticketId],
    enabled: enabled && !!ticketId,
    refetchInterval: 15000,
    queryFn: async () => {
      let query = supabase.from("support_tickets").select("*").eq("id", ticketId!);
      if (!admin) query = query.eq("equipe_id", equipe!.id);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const messages = useInfiniteQuery({
    queryKey: ["support", ...scope, "messages", ticketId],
    enabled: enabled && !!ticket.data && !!ticketId,
    initialPageParam: 0,
    refetchInterval: 15000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.from("support_ticket_messages").select("*")
        .eq("ticket_id", ticketId!).order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(pageParam, pageParam + TICKET_PAGE_SIZE - 1);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last, pages) => last.length === TICKET_PAGE_SIZE ? pages.length * TICKET_PAGE_SIZE : undefined,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["support"] });
  return { tickets, teams, ticket, messages, refresh, enabled };
}
