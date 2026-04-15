import { useState, useRef, useEffect, useMemo } from "react";
import { useLeads } from "@/hooks/useLeads";
import { useMessages } from "@/hooks/useMessages";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useTasks } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/integrations/supabase/client";
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { ChatInput } from "@/components/inbox/ChatInput";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { CRMContextPanel } from "@/components/inbox/CRMContextPanel";
import { MessageSquare, Loader2, PanelLeft, PanelRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LeadDetailsModal } from "@/components/crm/LeadDetailsModal";
import { ChatSession, Task } from "@/types/chat";
import { Lead } from "@/types/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const Chat = () => {
  // 0. Auth e Role (Fase 2 — filtro por permissão)
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const currentUserId = user?.id;
  const { teamMembers } = useTeamMembers();

  // 1. Busca Leads Reais do Supabase
  const { leads, isLoading: loadingLeads, refetch: refetchLeads, updateLead, deleteLead } = useLeads();
  const { stages } = usePipelineStages();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);

  // Toggle states for panels
  const [showInbox, setShowInbox] = useState(true);
  const [showCRM, setShowCRM] = useState(true);

  // 2. Busca Mensagens do Lead Selecionado (Com Realtime)
  const selectedLead = leads?.find(l => l.id === selectedLeadId);
  const { messages, loading: loadingMessages, addOptimisticMessage } = useMessages(
    selectedLeadId || undefined,
    selectedLead?.gpt_maker_chat_id
  );

  // 3. Busca Tasks do Lead Selecionado (Com Realtime e Persistência)
  const { tasks, createTask, toggleTask, isLoading: loadingTasks } = useTasks(selectedLeadId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages — simple and reliable
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    });
  };

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedLeadId]);

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
      customerAvatar: lead.profile_picture || undefined,
      status: lead.atendido_por_agente ? 'human_handling' : 'bot_handling',
      // Online = last message within 24h
      isOnline: lead.last_message_at
        ? (Date.now() - new Date(lead.last_message_at).getTime()) < 86_400_000
        : false,
      unreadCount: lead.unread_count || 0,
      lastMessage: "Clique para ver",
      lastMessageTime: new Date(lead.last_message_at || lead.created_at || new Date()),
      tags: lead.tags || [],
      // Fase 2: Omnichannel
      channel: lead.channel || 'whatsapp',
      agentName: lead.agent_name || undefined,
      responsibleId: lead.responsible_id || lead.assigned_to || undefined,
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
      customerAvatar: lead.profile_picture || undefined,
      leadId: lead.id,
      lastMessage: "Clique para ver",
      lastMessageTime: new Date(lead.last_message_at || lead.created_at || new Date()),
      status: lead.atendido_por_agente ? 'human_handling' as const : 'bot_handling' as const,
      unreadCount: lead.unread_count || 0,
      leadType: lead.lead_type,
      responsibleId: lead.responsible_id || lead.assigned_to,
      // Online = last message within 24h
      isOnline: lead.last_message_at
        ? (Date.now() - new Date(lead.last_message_at).getTime()) < 86_400_000
        : false,
      // Fase 2: Omnichannel
      channel: lead.channel || 'whatsapp',
      agentName: lead.agent_name || undefined,
      crmData: {
        value: lead.opportunity_value || 0,
        stage: lead.stage_id || 'Novo',
        company: lead.name,
        notes: lead.observations || '',
      },
      tags: lead.tags || [],
      messages: []
    })) || [];
  }, [leads]);

  // Envio de Mensagem Real (Chama a Edge Function)
  const handleSendMessage = async (content: string, media?: { url: string; type: string }) => {
    if (!selectedLeadId) return;

    try {
      // Optimistic Update
      const tempId = `temp-${Date.now()}`;
      addOptimisticMessage({
        id: tempId,
        content,
        lead_id: selectedLeadId,
        sender_type: 'agent',
        created_at: new Date().toISOString(),
        media_url: media?.url || null,
        media_type: media?.type || null,
      } as any);

      const lead = leads?.find(l => l.id === selectedLeadId);
      const { error } = await supabase.functions.invoke('send-chat-message', {
        body: {
          lead_id: selectedLeadId,
          content: content,
          media_type: media ? media.type : 'text',
          media_url: media?.url,
          chat_id: lead?.gpt_maker_chat_id
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
    const isHuman = lead?.atendido_por_agente;

    try {
      // Atualiza no banco
      await supabase
        .from('leads')
        .update({ atendido_por_agente: !isHuman })
        .eq('id', selectedLeadId);

      // Chama API do GPT Maker para controlar bot
      const chatId = lead?.gpt_maker_chat_id;
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

    const updates: Record<string, unknown> = {};
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

  // Assign responsible team member
  const handleAssignResponsible = async (userId: string | null) => {
    if (!selectedLeadId) return;
    try {
      await supabase
        .from('leads')
        .update({ responsible_id: userId, assigned_to: userId })
        .eq('id', selectedLeadId);
      refetchLeads();
      toast.success(userId ? 'Responsável atribuído' : 'Responsável removido');
    } catch (err) {
      toast.error('Erro ao atribuir responsável');
    }
  };

  // Tasks handlers - now using the useTasks hook for persistence
  const handleAddTask = async (title: string) => {
    if (!selectedLeadId) return;
    await createTask(title);
  };

  const handleToggleTask = async (taskId: string) => {
    await toggleTask(taskId);
  };

  // Adapt tasks to CRMContextPanel format
  const currentTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    completed: t.status === 'done',
    createdAt: new Date(t.created_at)
  }));



  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-background">
      {/* Toggle Inbox Button (when collapsed) */}
      {!showInbox && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background border shadow-sm"
          onClick={() => setShowInbox(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Coluna 1: Inbox (Sidebar de Leads) */}
      <div className={cn(
        "border-r flex-shrink-0 transition-all duration-300 relative",
        showInbox ? "w-1/4 min-w-[280px] max-w-[360px]" : "w-0 min-w-0 overflow-hidden"
      )}>
        {showInbox && (
          <>
            {/* Toggle button inside inbox */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-7 w-7"
              onClick={() => setShowInbox(false)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {loadingLeads ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
              </div>
            ) : (
              <InboxSidebar
                sessions={sessionsAdapter}
                selectedSessionId={selectedLeadId}
                currentUserId={currentUserId}
                isAdmin={isAdmin()}
                onSelectSession={(id) => {
                  setSelectedLeadId(id);
                  if (window.innerWidth < 1024) {
                    setShowInbox(false);
                  }
                }}
              />
            )}
          </>
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
                  stages={stages}
                  teamMembers={teamMembers}
                  onToggleHandoff={handleToggleHandoff}
                  onUpdateCRM={handleUpdateCRM}
                  onAssignResponsible={handleAssignResponsible}
                  onBack={() => setShowInbox(true)}
                  onOpenLeadDetails={() => setShowLeadModal(true)}
                />
              </div>
              {/* Toggle buttons */}
              <div className="flex items-center gap-1 mr-2">
                {!showInbox && (
                  <Button variant="ghost" size="icon" onClick={() => setShowInbox(true)}>
                    <PanelLeft className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex"
                  onClick={() => setShowCRM(!showCRM)}
                >
                  <PanelRight className="h-5 w-5" />
                </Button>
                {/* Botão CRM mobile */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="lg:hidden">
                      <PanelRight className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-80 p-0">
                    <CRMContextPanel
                        session={selectedSession}
                        tasks={currentTasks}
                        onUpdateCRM={handleUpdateCRM}
                        onAddTask={handleAddTask}
                        onToggleTask={handleToggleTask}
                        onOpenLeadDetails={() => setShowLeadModal(true)}
                    />
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Mensagens — always light background, scroll to bottom like WhatsApp */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto bg-[#f0f2f5]"
            >
              <div className="max-w-3xl w-full mx-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  messages
                    .filter(msg => msg.sender_type !== 'system')
                    .map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={{
                          id: msg.id,
                          content: msg.content || '',
                          sender: msg.sender_type as 'customer' | 'agent' | 'ai',
                          timestamp: new Date(msg.created_at || new Date()),
                          type: 'text',
                          mediaUrl: msg.media_url,
                          mediaType: msg.media_type as 'image' | 'audio' | 'video' | 'document' | undefined,
                          readAt: msg.read_at ? new Date(msg.read_at) : undefined,
                          senderName: msg.sender_type !== 'customer'
                            ? (selectedLead?.agent_name || 'Assistente IA')
                            : undefined,
                        }}
                      />
                    ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

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

      {/* Toggle CRM Button (when collapsed on desktop) */}
      {!showCRM && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background border shadow-sm hidden lg:flex"
          onClick={() => setShowCRM(true)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Coluna 3: Painel CRM (Desktop) */}
      <div className={cn(
        "border-l hidden lg:block flex-shrink-0 overflow-hidden transition-all duration-300 relative",
        showCRM ? "w-80" : "w-0"
      )}>
        {showCRM && (
          <>
            {/* Toggle button inside CRM panel */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-2 z-10 h-7 w-7"
              onClick={() => setShowCRM(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <CRMContextPanel
                session={selectedSession}
                tasks={currentTasks}
                onUpdateCRM={handleUpdateCRM}
                onAddTask={handleAddTask}
                onToggleTask={handleToggleTask}
                onOpenLeadDetails={() => setShowLeadModal(true)}
            />
          </>
        )}
      </div>

      <LeadDetailsModal
        lead={leads?.find(l => l.id === selectedLeadId) as Lead || null}
        stages={stages}
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        onSave={(data) => {
          updateLead.mutate(data);
          setShowLeadModal(false);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setSelectedLeadId(null);
          setShowLeadModal(false);
        }}
      />
    </div>
  );
};

export default Chat;
