import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WebhookLog } from "@/types/webhook";

interface UseWebhookLogsOptions {
  direction?: 'inbound' | 'outbound';
  limit?: number;
}

export const useWebhookLogs = (options: UseWebhookLogsOptions = {}) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const { direction, limit = 50 } = options;

  const logsQuery = useQuery({
    queryKey: ["webhook-logs", equipeId, direction, limit],
    queryFn: async () => {
      if (!equipeId) return [];
      
      let query = supabase
        .from("webhook_logs")
        .select("*")
        .eq("equipe_id", equipeId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (direction) {
        query = query.eq("direction", direction);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as WebhookLog[];
    },
    enabled: !!equipeId,
  });

  return {
    logs: logsQuery.data || [],
    isLoading: logsQuery.isLoading,
    error: logsQuery.error,
    refetch: logsQuery.refetch,
  };
};
