import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { useLeads } from './useLeads';

// Define o tipo da mensagem baseado no banco de dados
type DbMessage = Database['public']['Tables']['messages']['Row'];

// Tipo estendido com campos de mídia
interface Message extends DbMessage {
  media_url: string | null;
  media_type: string | null;
}

export const useMessages = (leadId: string | undefined) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const addOptimisticMessage = (msg: Message) => {
    setMessages((current) => sortMessages([...current, msg]));
  };

  // Precisamos do lead atual para pegar o Chat ID do GPT Maker para a sincronização
  const { leads } = useLeads();
  const currentLead = leads?.find(l => l.id === leadId);

  // --- FUNÇÃO AUXILIAR DE ORDENAÇÃO ---
  // Garante que a mensagem mais antiga (menor data) fique no topo e a nova embaixo
  const sortMessages = (msgs: Message[]) => {
    return [...msgs].sort((a, b) => 
      new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
  };

  useEffect(() => {
    // Se não tem lead selecionado, limpa a tela
    if (!leadId) {
      setMessages([]);
      return;
    }

    const initChat = async () => {
      setLoading(true);

      try {
        // 1. Busca mensagens salvas no Banco (Histórico Rápido)
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('lead_id', leadId);

        if (error) throw error;
        
        // Ordena antes de exibir
        if (data) setMessages(sortMessages(data as Message[]));

        // 2. Zera o contador de "Não Lidos" no banco
        await supabase
          .from('leads')
          .update({ unread_count: 0 })
          .eq('id', leadId);

      } catch (error) {
        console.error('Erro ao carregar histórico:', error);
      } finally {
        setLoading(false);
      }

      // 3. SINCRONIZAÇÃO EM SEGUNDO PLANO (O Pulo do Gato)
      // Tenta buscar no GPT Maker mensagens que podem estar faltando (ex: enviadas pelo robô)
      if (currentLead?.gpt_maker_chat_id) {
          setIsSyncing(true);
          try {
              // Chama a Edge Function que busca na API do GPT Maker e salva no banco
              // O Realtime abaixo vai detectar essas inserções e atualizar a tela sozinho
              await supabase.functions.invoke('sync-chat-history', {
                  body: { 
                      lead_id: leadId, 
                      chat_id: currentLead.gpt_maker_chat_id 
                  }
              });
          } catch (e) {
              console.error("Erro no sync silencioso:", e);
          } finally {
              setIsSyncing(false);
          }
      }
    };

    initChat();

    // 4. CONEXÃO REALTIME (Ouvindo novidades)
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
          const newMsg = payload.new as Message;

          // Adiciona a nova mensagem APENAS se não existir (evita duplicatas)
          setMessages((current) => {
            // Verifica se já existe pelo ID
            const exists = current.some(m => m.id === newMsg.id);
            if (exists) {
              console.log('[Realtime] Mensagem duplicada ignorada:', newMsg.id);
              return current;
            }

            // Remove a mensagem otimista correspondente (mesmo conteúdo e remetente)
            const withoutOptimistic = current.filter(m => {
              const isTemp = m.id.startsWith('temp-');
              const sameContent = m.content === newMsg.content;
              const sameSender = m.sender_type === newMsg.sender_type;
              if (isTemp && sameContent && sameSender) {
                return false;
              }
              return true;
            });

            return sortMessages([...withoutOptimistic, newMsg]);
          });

          // Garante que o contador continue zerado enquanto o chat está aberto
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
          setMessages((current) => {
            const updatedList = current.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg);
            return sortMessages(updatedList);
          });
        }
      )
      .subscribe();

    // Limpeza ao sair do chat ou mudar de lead
    return () => {
      supabase.removeChannel(channel);
    };

  }, [leadId, currentLead?.gpt_maker_chat_id]); // Recria o hook se mudar o Lead ou o ChatID

  return { messages, loading, isSyncing, addOptimisticMessage };
};
