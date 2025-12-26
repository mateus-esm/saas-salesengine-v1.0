import { useState, useRef, useEffect } from "react";
import { useLeads } from "@/hooks/useLeads"; // Hook de Leads Reais
import { useMessages } from "@/hooks/useMessages"; // Hook de Mensagens Reais
import { supabase } from "@/integrations/supabase/client"; // Cliente para enviar
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { ChatInput } from "@/components/inbox/ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Loader2 } from "lucide-react";

const Chat = () => {
  // 1. Busca Leads Reais do Supabase
  const { leads, isLoading: loadingLeads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // 2. Busca Mensagens do Lead Selecionado (Com Realtime)
  const { messages, loading: loadingMessages } = useMessages(selectedLeadId || undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Envio de Mensagem Real (Chama a Edge Function)
  const handleSendMessage = async (content: string) => {
    if (!selectedLeadId) return;

    try {
      // Chama a função que você já criou 'send-chat-message'
      const { error } = await supabase.functions.invoke('send-chat-message', {
        body: {
          lead_id: selectedLeadId,
          content: content,
          type: 'text',
          chat_id: leads.find(l => l.id === selectedLeadId)?.gpt_maker_chat_id // Passando o chat_id se disponível
        }
      });

      if (error) throw error;
      // Não precisa atualizar estado manual, o Realtime do useMessages vai fazer a tela piscar
    } catch (err) {
      console.error("Erro ao enviar:", err);
      // alert("Erro ao enviar mensagem. Verifique o console."); // Omit alert for better UX, maybe toast?
    }
  };

  // Adaptação dos dados para o componente Sidebar
  // O componente espera 'sessions', mas temos 'leads'. Vamos adaptar.
  const sessionsAdapter = leads?.map(lead => ({
    id: lead.id,
    customerName: lead.nome || lead.name || "Sem Nome", // Fallback para tipos diferentes
    customerPhone: lead.plataforma_origem || 'WhatsApp',
    leadId: lead.id,
    lastMessage: "Clique para ver", // Idealmente viria do banco
    lastMessageTime: new Date(lead.last_message_at || lead.created_at || new Date()),
    status: 'bot_handling', // Placeholder
    unreadCount: 0,
    crmData: {
      value: lead.opportunity_value || 0,
      stage: 'Novo',
      company: lead.nome
    },
    messages: []
  })) || [];

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-background">
      {/* Sidebar de Leads */}
      <div className="w-1/4 min-w-[280px] max-w-[360px] border-r">
        {loadingLeads ? (
          <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
        ) : (
          <InboxSidebar
            sessions={sessionsAdapter as any} // Cast temporário para compatibilidade
            selectedSessionId={selectedLeadId}
            onSelectSession={setSelectedLeadId}
          />
        )}
      </div>

      {/* Área de Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedLeadId ? (
          <>
            {/* Mensagens */}
            <ScrollArea className="flex-1 p-4 bg-muted/30">
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={{
                      id: msg.id,
                      content: msg.content || '',
                      sender: (msg.sender_type === 'agent' ? 'agent' : 'customer') as any, // Cast type
                      timestamp: new Date(msg.created_at || new Date()),
                      type: 'text'
                    }}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              placeholder="Digite sua mensagem..."
              disabled={loadingMessages}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Selecione um lead para iniciar o atendimento</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
