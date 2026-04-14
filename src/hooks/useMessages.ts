import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

// Define o tipo da mensagem baseado no banco de dados
type DbMessage = Database['public']['Tables']['messages']['Row'];

// Tipo estendido com campos de mídia
interface Message extends DbMessage {
  media_url: string | null;
  media_type: string | null;
}

// Global cache for messages
const messagesCache = new Map<string, Message[]>();

export const useMessages = (leadId: string | undefined, chatId?: string | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const addOptimisticMessage = (msg: Message) => {
    setMessages((current) => {
      const newMsgs = sortMessages([...current, msg]);
      if (leadId) messagesCache.set(leadId, newMsgs);
      return newMsgs;
    });
  };

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

    // Configura inicial instantâneo se houver cache
    if (messagesCache.has(leadId)) {
      setMessages(messagesCache.get(leadId)!);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }

    const initChat = async () => {
      try {
        if (!messagesCache.has(leadId)) {
          // 1. Busca mensagens salvas no Banco (Histórico Rápido)
          const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('lead_id', leadId);

          if (error) throw error;

          if (data) {
            const sortedData = sortMessages(data as Message[]);
            messagesCache.set(leadId, sortedData);
            // Merge: preserva mensagens Realtime que chegaram durante o fetch
            // (evita substituir estado e perder mensagens que chegaram em paralelo)
            setMessages(current => {
              const dbIds = new Set(sortedData.map(m => m.id));
              const realtimeOnly = current.filter(m => !dbIds.has(m.id) && !m.id.startsWith('temp-'));
              const merged = sortMessages([...sortedData, ...realtimeOnly]);
              messagesCache.set(leadId, merged);
              return merged;
            });
          }
        }

        // 2. Transforma como "Lido" e zera contador no banco DE FORMA INSTANTÂNEA
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
      // Tenta buscar no GPT Maker mensagens que podem estar faltando
      if (chatId) {
          setIsSyncing(true);
          try {
              await supabase.functions.invoke('sync-chat-history', {
                  body: {
                      lead_id: leadId,
                      chat_id: chatId
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

          setMessages((current) => {
            // Guarda 1: mesmo ID já está na lista (idempotência)
            if (current.some(m => m.id === newMsg.id)) return current;

            // Guarda 2: já existe mensagem com mesmo conteúdo + sender + tempo próximo (≤ 30s)
            // 30s cobre atrasos do webhook e eventuais ecos tardios do GPT Maker.
            const newTime = new Date(newMsg.created_at || 0).getTime();
            const WINDOW_MS = 30_000;
            const isDuplicate = current.some(m => {
              if (m.id.startsWith('temp-')) return false; // ignorar otimistas
              if (m.sender_type !== newMsg.sender_type) return false;
              const mTime = new Date(m.created_at || 0).getTime();
              if (Math.abs(mTime - newTime) > WINDOW_MS) return false;
              // conteúdo idêntico (null e '' são tratados como iguais)
              const mContent = (m.content || '').trim();
              const nContent = (newMsg.content || '').trim();
              if (mContent !== nContent) return false;
              // mídia: se ambas tiverem URL, devem ser iguais; se nenhuma tiver, ok
              if (m.media_url && newMsg.media_url) return m.media_url === newMsg.media_url;
              if (!m.media_url && !newMsg.media_url) return true;
              return false;
            });
            if (isDuplicate) {
              console.warn('[useMessages] Mensagem duplicada bloqueada na UI:', newMsg.id);
              return current;
            }

            // Remove otimista correspondente (conteúdo + sender + sem ID real)
            const withoutOptimistic = current.filter(m => {
              if (!m.id.startsWith('temp-')) return true;
              const sameContent = (m.content || '').trim() === (newMsg.content || '').trim();
              const sameSender = m.sender_type === newMsg.sender_type;
              return !(sameContent && sameSender);
            });

            const newMsgs = sortMessages([...withoutOptimistic, newMsg]);
            messagesCache.set(leadId, newMsgs);
            return newMsgs;
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
            const newMsgs = sortMessages(updatedList);
            messagesCache.set(leadId, newMsgs);
            return newMsgs;
          });
        }
      )
      .subscribe();

    // Limpeza ao sair do chat ou mudar de lead
    return () => {
      supabase.removeChannel(channel);
    };

  }, [leadId]); // Recria o hook apenas quando muda o Lead

  return { messages, loading, isSyncing, addOptimisticMessage };
};
