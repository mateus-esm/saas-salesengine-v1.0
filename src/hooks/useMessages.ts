import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

// Define o tipo da mensagem baseado no banco de dados
type Message = Database['public']['Tables']['messages']['Row'];

export const useMessages = (leadId: string | undefined) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Se não tem lead selecionado, limpa as mensagens
    if (!leadId) {
      setMessages([]);
      return;
    }

    const fetchHistoryAndMarkRead = async () => {
      setLoading(true);

      try {
        // 1. Busca mensagens (Histórico)
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (data) setMessages(data);

        // 2. Zera o contador de não lidas (Badge) ao abrir o chat
        const { error: updateError } = await supabase
          .from('leads')
          .update({ unread_count: 0 })
          .eq('id', leadId);

        if (updateError) {
          console.error('Erro ao zerar contador de mensagens:', updateError);
        }

      } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoryAndMarkRead();

    // 3. Conexão Realtime (Para receber novas mensagens instantaneamente)
    const channel = supabase
      .channel(`chat_room_${leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Escuta novas mensagens chegando
          schema: 'public',
          table: 'messages',
          filter: `lead_id=eq.${leadId}` // Filtra só para este chat
        },
        (payload) => {
          // Adiciona a nova mensagem na lista sem precisar recarregar
          const newMsg = payload.new as Message;
          setMessages((current) => [...current, newMsg]);
          
          // Opcional: Se o chat já está aberto, garante que o contador continue zerado
          // (Isso evita que o badge suba enquanto você está lendo)
          if (leadId) {
             supabase.from('leads').update({ unread_count: 0 }).eq('id', leadId);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Escuta atualizações (ex: status mudou para 'lido')
          schema: 'public',
          table: 'messages',
          filter: `lead_id=eq.${leadId}`
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((current) =>
            current.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg)
          );
        }
      )
      .subscribe();

    // Limpeza ao sair do chat ou mudar de lead
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]); // Recria o hook sempre que o leadId mudar

  return { messages, loading };
};

