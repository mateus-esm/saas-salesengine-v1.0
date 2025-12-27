import { useState, useRef, useEffect, useMemo } from "react";
import { useLeads } from "@/hooks/useLeads";
import { useMessages } from "@/hooks/useMessages";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { supabase } from "@/integrations/supabase/client";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { ChatInput } from "@/components/inbox/ChatInput";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { CRMContextPanel } from "@/components/inbox/CRMContextPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Loader2, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ChatSession, Task } from "@/types/chat";
import { toast } from "sonner";

const Chat = () => {
  // 1. Busca Leads Reais do Supabase
  const { leads, isLoading: loadingLeads, refetch: refetchLeads } = useLeads();
  const { stages } = usePipelineStages();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // 2. Busca Mensagens do Lead Selecionado (Com Realtime)
  const { messages, loading: loadingMessages } = useMessages(selectedLeadId || undefined);

  // 3. Estado de Tasks local (por lead)
  const [tasksByLead, setTasksByLead] = useState<Record<string, Task[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Sessão selecionada adaptada para ChatSession
  const selectedSession = useMemo((): ChatSession | null => {
    if (!selectedLeadId) return null;
    const lead = leads?.find(l => l.id === selectedLeadId);
    if (!lead) return null;

    const stageName = stages.find(s => s.id === lead.stage_id)?.name || "Novo Lead";

    return {
      id: lead.id,
      leadId: lead.id,
      customerName: lead.name || "Sem Nome",
      customerPhone: lead.phone || lead.origem || "WhatsApp",
      status: (lead as any).atendido_por_agente ? 'human_handling' : 'bot_handling',
      isOnline: true,
      unreadCount: (lead as any).unread_count || 0,
      lastMessage: "Clique para ver",
      lastMessageTime: new Date(lead.last_message_at || lead.created_at || new Date()),
      tags: lead.tags || [],
      crmData: {
        value: lead.opportunity_value || 0,
        stage: lead.stage_id || stageName,
        notes: lead.observations || "",
        email: lead.email || undefined,
        company: lead.name,
        position: undefined,
      },
      messages: [],
    };
  }, [selectedLeadId, leads, stages]);

  // Adaptação dos dados para o componente Sidebar
  const sessionsAdapter = useMemo(() => {
    return leads?.map(lead => ({
      id: lead.id,
      customerName: lead.name || "Sem Nome",
      customerPhone: lead.origem || lead.source || 'WhatsApp',
      leadId: lead.id,
      lastMessage: "Clique para ver",
      lastMessageTime: new Date(lead.last_message_at || lead.created_at || new Date()),
      status: 'bot_handling' as const,
      unreadCount: (lead as any).unread_count || 0,
      crmData: {
        value: lead.opportunity_value || 0,
        stage: 'Novo',
        company: lead.name,
        notes: '',
      },
      tags: [],
      messages: []
    })) || [];
  }, [leads]);

  // Envio de Mensagem Real (Chama a Edge Function)
  const handleSendMessage = async (content: string) => {
    if (!selectedLeadId) return;

    try {
      const lead = leads?.find(l => l.id === selectedLeadId);
      const { error } = await supabase.functions.invoke('send-chat-message', {
        body: {
          lead_id: selectedLeadId,
          content: content,
          type: 'text',
          chat_id: (lead as any)?.gpt_maker_chat_id
        }
      });

      if (error) throw error;
    } catch (err) {
      console.error("Erro ao enviar:", err);
      toast.error("Erro ao enviar mensagem");
    }
  };

  // Toggle atendimento IA/Humano
  const handleToggleHandoff = async () => {
    if (!selectedLeadId) return;
    const lead = leads?.find(l => l.id === selectedLeadId);
    const isHuman = (lead as any)?.atendido_por_agente;

    try {
      // Atualiza no banco
      await supabase
        .from('leads')
        .update({ atendido_por_agente: !isHuman })
        .eq('id', selectedLeadId);

      // Chama API do GPT Maker para controlar bot
      const chatId = (lead as any)?.gpt_maker_chat_id;
      if (chatId) {
        await supabase.functions.invoke('send-chat-message', {
          body: {
            chat_id: chatId,
            action: isHuman ? 'stop_control' : 'take_control'
          }
        });
      }

      toast.success(isHuman ? "Devolvido ao bot" : "Atendimento assumido");
      refetchLeads();
    } catch (err) {
      console.error("Erro ao alternar atendimento:", err);
      toast.error("Erro ao alternar atendimento");
    }
  };

  // Atualizar dados do CRM
  const handleUpdateCRM = async (data: Partial<ChatSession["crmData"]>) => {
    if (!selectedLeadId) return;

    const updates: Record<string, any> = {};
    if (data.value !== undefined) updates.opportunity_value = data.value;
    if (data.stage !== undefined) updates.stage_id = data.stage;
    if (data.notes !== undefined) updates.observations = data.notes;

    try {
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', selectedLeadId);

      refetchLeads();
    } catch (err) {
      console.error("Erro ao atualizar lead:", err);
      toast.error("Erro ao atualizar lead");
    }
  };

  // Tasks handlers
  const currentTasks = tasksByLead[selectedLeadId || ""] || [];

  const handleAddTask = (title: string) => {
    if (!selectedLeadId) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      createdAt: new Date()
    };
    setTasksByLead(prev => ({
      ...prev,
      [selectedLeadId]: [...(prev[selectedLeadId] || []), newTask]
    }));
  };

  const handleToggleTask = (taskId: string) => {
    if (!selectedLeadId) return;
    setTasksByLead(prev => ({
      ...prev,
      [selectedLeadId]: (prev[selectedLeadId] || []).map(t =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      )
    }));
  };

  // CRM Panel Component (para reutilizar em mobile sheet)
  const CRMPanelContent = () => (
    <CRMContextPanel
      session={selectedSession}
      tasks={currentTasks}
      onUpdateCRM={handleUpdateCRM}
      onAddTask={handleAddTask}
      onToggleTask={handleToggleTask}
    />
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-background">
      {/* Coluna 1: Inbox (Sidebar de Leads) */}
      <div className="w-1/4 min-w-[280px] max-w-[360px] border-r flex-shrink-0">
        {loadingLeads ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
          </div>
        ) : (
          <InboxSidebar
            sessions={sessionsAdapter as any}
            selectedSessionId={selectedLeadId}
            onSelectSession={setSelectedLeadId}
          />
        )}
      </div>

      {/* Coluna 2: Chat (Mensagens) */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedLeadId && selectedSession ? (
          <>
            {/* Header do Chat */}
            <div className="flex items-center justify-between border-b">
              <div className="flex-1">
                <ConversationHeader
                  session={selectedSession}
                  onToggleHandoff={handleToggleHandoff}
                />
              </div>
              {/* Botão CRM mobile */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden mr-2">
                    <PanelRight className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <CRMPanelContent />
                </SheetContent>
              </Sheet>
            </div>

            {/* Mensagens */}
            <ScrollArea className="flex-1 p-4 bg-muted/30">
              <div className="max-w-3xl mx-auto space-y-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={{
                        id: msg.id,
                        content: msg.content || '',
                        sender: (msg.sender_type === 'agent' ? 'agent' : 'customer') as any,
                        timestamp: new Date(msg.created_at || new Date()),
                        type: 'text'
                      }}
                    />
                  ))
                )}
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

      {/* Coluna 3: Painel CRM (Desktop) */}
      <div className="w-80 border-l hidden lg:block flex-shrink-0 overflow-hidden">
        <CRMPanelContent />
      </div>
    </div>
  );
};

export default Chat;
