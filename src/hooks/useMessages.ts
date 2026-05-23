import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type DbMessage = Database['public']['Tables']['messages']['Row'];

interface Message extends DbMessage {
  media_url: string | null;
  media_type: string | null;
  conversation_id: string | null;
}

// Global cache keyed by conversation id
const messagesCache = new Map<string, Message[]>();

// Sprint 5.5 1.3 — Latency deceleration.
// In-flight dedup: if the user hovers conversation X and then clicks X (or
// hovers it twice rapidly), we only want one network fetch. Keying by
// conversation id makes the second caller await the same promise.
const inflightFetches = new Map<string, Promise<void>>();

const sortMessagesByDate = (msgs: Message[]) =>
  [...msgs].sort(
    (a, b) =>
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime(),
  );

/**
 * Warm the message cache for a conversation without subscribing to realtime
 * updates. Safe to call on hover — cheap when cached, a single SELECT
 * otherwise. Subsequent useMessages() mounts for the same conversation will
 * read from the cache and render in the same frame.
 */
export const prefetchConversationMessages = async (
  conversationId: string,
): Promise<void> => {
  if (!conversationId) return;
  if (messagesCache.has(conversationId)) return;
  const existing = inflightFetches.get(conversationId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { data, error } = await sb
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      if (data) {
        messagesCache.set(conversationId, sortMessagesByDate(data as Message[]));
      }
    } catch (e) {
      // Silent — prefetch is a best-effort optimization; the eventual
      // useMessages() mount will retry on its own.
      console.warn('[prefetchConversationMessages] falhou:', e);
    } finally {
      inflightFetches.delete(conversationId);
    }
  })();

  inflightFetches.set(conversationId, promise);
  return promise;
};

/**
 * Epic 1: keyed by conversationId. gptMakerChatId is still passed to trigger
 * the silent background sync-chat-history call.
 */
export const useMessages = (
  conversationId: string | undefined,
  gptMakerChatId?: string | null
) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const addOptimisticMessage = (msg: Message) => {
    setMessages((current) => {
      const newMsgs = sortMessages([...current, msg]);
      if (conversationId) messagesCache.set(conversationId, newMsgs);
      return newMsgs;
    });
  };

  const sortMessages = sortMessagesByDate;

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    if (messagesCache.has(conversationId)) {
      setMessages(messagesCache.get(conversationId)!);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }

    const initChat = async () => {
      try {
        if (!messagesCache.has(conversationId)) {
          const { data, error } = await sb
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId);

          if (error) throw error;

          if (data) {
            const sortedData = sortMessages(data as Message[]);
            messagesCache.set(conversationId, sortedData);
            setMessages((current) => {
              const dbIds = new Set(sortedData.map((m) => m.id));
              const realtimeOnly = current.filter(
                (m) => !dbIds.has(m.id) && !m.id.startsWith('temp-')
              );
              const merged = sortMessages([...sortedData, ...realtimeOnly]);
              messagesCache.set(conversationId, merged);
              return merged;
            });
          }
        }

        // Mark conversation as read (zero unread_count)
        await sb
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversationId);
      } catch (error) {
        console.error('Erro ao carregar histórico:', error);
      } finally {
        setLoading(false);
      }

      // Silent background sync from provider (GPT Maker)
      if (gptMakerChatId) {
        setIsSyncing(true);
        try {
          await supabase.functions.invoke('sync-chat-history', {
            body: {
              conversation_id: conversationId,
              chat_id: gptMakerChatId,
            },
          });
        } catch (e) {
          console.error('Erro no sync silencioso:', e);
        } finally {
          setIsSyncing(false);
        }
      }
    };

    initChat();

    const channel = supabase
      .channel(`chat_room_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;

          setMessages((current) => {
            if (current.some((m) => m.id === newMsg.id)) return current;

            // Remove matching optimistic message
            const withoutOptimistic = current.filter((m) => {
              if (!m.id.startsWith('temp-')) return true;
              const sameContent =
                (m.content || '').trim() === (newMsg.content || '').trim();
              const sameSender = m.sender_type === newMsg.sender_type;
              return !(sameContent && sameSender);
            });

            const newMsgs = sortMessages([...withoutOptimistic, newMsg]);
            messagesCache.set(conversationId, newMsgs);
            return newMsgs;
          });

          // Keep unread_count at 0 while chat is open
          sb
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', conversationId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((current) => {
            const updatedList = current.map((msg) =>
              msg.id === updatedMsg.id ? updatedMsg : msg
            );
            const newMsgs = sortMessages(updatedList);
            messagesCache.set(conversationId, newMsgs);
            return newMsgs;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, gptMakerChatId]);

  return { messages, loading, isSyncing, addOptimisticMessage };
};
