import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ChatSession {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  last_message_at: string;
  stage_id: string | null;
  opportunity_value: number | null;
  observations: string | null;
  tags: string[] | null;
  atendido_por_agente: boolean | null;
  unread_count?: number;
  last_message?: string;
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { equipe } = useAuth();
  const equipeId = equipe?.id;

  // Fetch all leads as chat sessions ordered by last_message_at
  const fetchSessions = useCallback(async () => {
    if (!equipeId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id,
          name,
          phone,
          email,
          last_message_at,
          stage_id,
          opportunity_value,
          observations,
          tags,
          atendido_por_agente
        `)
        .eq('equipe_id', equipeId)
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // Get unread counts and last messages for each lead
      const sessionsWithDetails = await Promise.all(
        (data || []).map(async (lead) => {
          // Get unread count
          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('lead_id', lead.id)
            .eq('sender_type', 'customer')
            .is('read_at', null);

          // Get last message
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...lead,
            unread_count: unreadCount || 0,
            last_message: lastMsg?.content || ''
          } as ChatSession;
        })
      );

      setSessions(sessionsWithDetails);
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      toast.error('Erro ao carregar conversas');
    } finally {
      setIsLoading(false);
    }
  }, [equipeId]);

  // Update lead's handling status
  const toggleHandoff = useCallback(async (leadId: string, isHumanHandling: boolean) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ atendido_por_agente: isHumanHandling })
        .eq('id', leadId);

      if (error) throw error;

      setSessions(prev => prev.map(s => 
        s.id === leadId ? { ...s, atendido_por_agente: isHumanHandling } : s
      ));

      toast.success(isHumanHandling ? 'Você assumiu o atendimento' : 'Conversa devolvida para a IA');
    } catch (error) {
      console.error('Error toggling handoff:', error);
      toast.error('Erro ao alterar atendimento');
    }
  }, []);

  // Update lead CRM data
  const updateLeadCRM = useCallback(async (leadId: string, data: Partial<ChatSession>) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update(data)
        .eq('id', leadId);

      if (error) throw error;

      setSessions(prev => prev.map(s => 
        s.id === leadId ? { ...s, ...data } : s
      ));
    } catch (error) {
      console.error('Error updating lead CRM:', error);
      toast.error('Erro ao atualizar dados');
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Realtime subscription for leads updates
  useEffect(() => {
    if (!equipeId) return;

    const channel = supabase
      .channel('leads-chat-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `equipe_id=eq.${equipeId}`
        },
        () => {
          // Refetch to get updated order and counts
          fetchSessions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          // Refetch when new messages arrive to update unread counts
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [equipeId, fetchSessions]);

  return {
    sessions,
    isLoading,
    toggleHandoff,
    updateLeadCRM,
    refetch: fetchSessions
  };
}
