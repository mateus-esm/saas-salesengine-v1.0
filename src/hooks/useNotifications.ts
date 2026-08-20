import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Sprint 8 T14 — the notification centre.
 *
 * Before this the product had only sonner toasts, which vanish on reload. A
 * billing warning nobody saw is a dispute waiting to happen, so notifications
 * are now rows that persist until read.
 */
export type Severity = "info" | "success" | "warn" | "critical";

export interface AppNotification {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications(limit = 30) {
  const { equipe } = useAuth();
  const equipeId = equipe?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", equipeId, limit],
    enabled: !!equipeId,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, severity, title, body, action_url, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  // Realtime: a critical notice must arrive without the user reloading. That is
  // the whole difference between "we told them" and "they found out".
  useEffect(() => {
    if (!equipeId) return;
    const channel = supabase
      .channel(`notifications:${equipeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `equipe_id=eq.${equipeId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          qc.invalidateQueries({ queryKey: ["notifications"] });
          // The toast is reinforcement; the row is the record.
          if (n.severity === "critical") {
            toast.error(n.title, { description: n.body ?? undefined });
          } else if (n.severity === "warn") {
            toast.warning(n.title, { description: n.body ?? undefined });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [equipeId, qc]);

  const unreadCount = (query.data ?? []).filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAllRead = async () => {
    const unread = (query.data ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (!unread.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return { notifications: query.data ?? [], isLoading: query.isLoading, unreadCount, markRead, markAllRead };
}

/** Relative time in pt-BR: "há 5 min", "ontem". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
