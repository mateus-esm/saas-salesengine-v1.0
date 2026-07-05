import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLeads } from "@/hooks/useLeads";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useTasks } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/integrations/supabase/client";
// Database types lag the new conversations table until `supabase gen types` reruns post-migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
import { InboxSidebar } from "@/components/inbox/InboxSidebar";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { ChatInput } from "@/components/inbox/ChatInput";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { CRMContextPanel } from "@/components/inbox/CRMContextPanel";
import { MessageSquare, Loader2, PanelLeft, PanelRight, ChevronLeft, ChevronRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ContactDetailsModal } from "@/components/crm/ContactDetailsModal";
import { ChatSession, ConversationStatus } from "@/types/chat";
import { Lead } from "@/types/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/displayName";

const Chat = () => {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const currentUserId = user?.id;
  const { teamMembers } = useTeamMembers();

  // Leads still power CRM fields (stage, value, notes) and the details modal.
  const { leads, isLoading: loadingLeads, refetch: refetchLeads, updateLead, deleteLead } = useLeads();
  const { stages } = usePipelineStages();

  // Epic 1: Conversations layer is the source of truth for the inbox list.
  const {
    conversations,
    isLoading: loadingConversations,
    updateStatus,
  } = useConversations();

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showInbox, setShowInbox] = useState(true);
  const [showCRM, setShowCRM] = useState(true);
  const [hasSoloInstance, setHasSoloInstance] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // T10 — Check for connected Solo API instance
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await sb
          .from('wpp_instances')
          .select('id,status')
          .eq('status', 'connected')
          .limit(1);
        if (!cancelled) {
          setHasSoloInstance((data?.length ?? 0) > 0);
        }
      } catch (err) {
        console.error("Erro ao verificar Solo API:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);
  const selectedLead = leads?.find(l => l.id === selectedConversation?.lead_id);

  // T15 — Zero-Friction Chat Link: when navigated to /chat?contact=<leadId>,
  // focus that contact's thread (creating an internal thread if none exists).
  useEffect(() => {
    const contactId = searchParams.get("contact");
    if (!contactId || loadingConversations) return;

    const existing = conversations.find((c) => c.lead_id === contactId);
    if (existing) {
      setSelectedConversationId(existing.id);
      setSearchParams({}, { replace: true });
      return;
    }

    const equipeId = leads?.find((l) => l.id === contactId)?.equipe_id;
    if (!equipeId) {
      setSearchParams({}, { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await sb
        .from("conversations")
        .insert({ equipe_id: equipeId, lead_id: contactId })
        .select("id")
        .single();
      if (!cancelled && !error && data?.id) {
        await queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
        setSelectedConversationId(data.id as string);
      }
      if (!cancelled) setSearchParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, conversations, loadingConversations, leads, queryClient, setSearchParams]);

  const {
    messages,
    loading: loadingMessages,
    addOptimisticMessage,
    syncHistory,
    isSyncing: isSyncingHistory,
  } = useMessages(
    selectedConversationId || undefined,
    selectedConversation?.gpt_maker_chat_id
  );


  // Tasks still scoped to the underlying lead (CRM-level, not per-conversation)
  const { tasks, createTask, toggleTask, updateTask, deleteTask } = useTasks(selectedConversation?.lead_id ?? null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Sprint 5.5 1.1 — Scroll Anchor.
  // The previous behavior force-scrolled to the bottom on every messages
  // update, which violently snapped operators out of historical context. We
  // now track whether the user is parked near the bottom; auto-scroll only
  // happens when they are, OR when the conversation changes (a deliberate
  // navigation, where landing at the bottom is the right default). A
  // floating "ir para o final" button surfaces when they've scrolled up.
  const isNearBottomRef = useRef(true);
  const lastConversationIdRef = useRef<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // 80px tolerance — covers the input bar height and avoids flickering the
    // "jump" button when the user is essentially at the bottom.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 80;
    isNearBottomRef.current = near;
    setShowJumpToLatest(!near);
  }, []);

  useLayoutEffect(() => {
    const switchedConversation =
      lastConversationIdRef.current !== selectedConversationId;
    lastConversationIdRef.current = selectedConversationId;
    if (switchedConversation) {
      // New conversation → reset anchor and land at the bottom.
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      scrollToBottom();
      return;
    }
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, selectedConversationId, scrollToBottom]);

  /** Map a Conversation → ChatSession for the header/CRM components. */
  const selectedSession = useMemo((): ChatSession | null => {
    if (!selectedConversation) return null;
    const lead = selectedLead;

    const stageName = stages.find(s => s.id === lead?.stage_id)?.name || "Novo Lead";

    // EPIC 3: Calculate 24h SLA based on the last message sent by the customer
    const lastCustomerMsg = [...messages].reverse().find(m => m.sender_type === 'customer');
    const lastCustomerMsgTime = lastCustomerMsg ? new Date(lastCustomerMsg.created_at || 0) : null;
    
    // Check if the elapsed time since the last customer message is <= 24 hours (86_400_000 ms)
    const isOnline24h = lastCustomerMsgTime
      ? (Date.now() - lastCustomerMsgTime.getTime()) <= 86_400_000
      : false;

    return {
      id: selectedConversation.id,
      conversationId: selectedConversation.id,
      conversationStatus: selectedConversation.status as ConversationStatus,
      leadId: selectedConversation.lead_id,
      customerName: formatDisplayName(
        lead?.name || selectedConversation.lead?.name,
        lead?.phone,
        "Sem Nome",
      ),
      customerPhone: lead?.phone || lead?.origem || "WhatsApp",
      customerAvatar: lead?.profile_picture || undefined,
      status: selectedConversation.atendido_por_agente ? 'human_handling' : 'bot_handling',
      isOnline: isOnline24h,
      unreadCount: selectedConversation.unread_count || 0,
      lastMessage: "Clique para ver",
      lastMessageTime: new Date(selectedConversation.last_message_at || selectedConversation.created_at || new Date()),
      tags: lead?.tags || [],
      channel: selectedConversation.channel || 'whatsapp',
      agentName: selectedConversation.agent_name || undefined,
      responsibleId: selectedConversation.responsible_id || undefined,
      crmData: {
        value: lead?.opportunity_value || 0,
        stage: lead?.stage_id || stageName,
        notes: lead?.observations || "",
        email: lead?.email || undefined,
        company: lead?.name,
        position: undefined,
        next_contact: lead?.next_contact || undefined,
      },
      messages: [],
    };
  }, [selectedConversation, selectedLead, stages, messages]);

  /** Map Conversations → sidebar ExtendedChatSession list. */
  const sessionsAdapter = useMemo(() => {
    return conversations.map(c => {
      const lead = leads?.find(l => l.id === c.lead_id);
      const leadSlice = c.lead;
      return {
        id: c.id,
        conversationId: c.id,
        conversationStatus: c.status as ConversationStatus,
        leadId: c.lead_id,
        customerName: formatDisplayName(
          lead?.name || leadSlice?.name,
          lead?.phone || leadSlice?.phone,
          "Sem Nome",
        ),
        customerPhone: lead?.phone || lead?.origem || leadSlice?.phone || leadSlice?.origem || 'WhatsApp',
        customerAvatar: lead?.profile_picture || leadSlice?.profile_picture || undefined,
        lastMessage: "Clique para ver",
        lastMessageTime: new Date(c.last_message_at || c.created_at || new Date()),
        status: (c.atendido_por_agente ? 'human_handling' : 'bot_handling') as 'human_handling' | 'bot_handling',
        unreadCount: c.unread_count || 0,
        leadType: (lead?.lead_type || leadSlice?.lead_type || null) as 'lead' | 'contact' | 'spam' | null,
        responsibleId: c.responsible_id,
        isOnline: c.last_message_at
          ? (Date.now() - new Date(c.last_message_at).getTime()) < 86_400_000
          : false,
        channel: c.channel || 'whatsapp',
        agentName: c.agent_name || undefined,
        crmData: {
          value: lead?.opportunity_value || 0,
          stage: lead?.stage_id || 'Novo',
          company: lead?.name,
          notes: lead?.observations || '',
          next_contact: lead?.next_contact || undefined,
        },
        tags: lead?.tags || leadSlice?.tags || [],
        messages: [],
      };
    });
  }, [conversations, leads]);

  const handleSendMessage = async (content: string, media?: { url: string; type: string }) => {
    if (!selectedConversationId || !selectedConversation) return;

    try {
      const tempId = `temp-${Date.now()}`;
      addOptimisticMessage({
        id: tempId,
        content,
        lead_id: selectedConversation.lead_id,
        conversation_id: selectedConversationId,
        sender_type: 'agent',
        sender_id: currentUserId || null,
        created_at: new Date().toISOString(),
        media_url: media?.url || null,
        media_type: media?.type || null,
      } as any);

      // T14 — a human typing takes the loop: flip to human handling instantly
      // so the header morphs to "Vendedor no Loop" + "Devolver" without a manual
      // toggle.
      if (!selectedConversation.atendido_por_agente) {
        void sb
          .from('conversations')
          .update({ atendido_por_agente: true })
          .eq('id', selectedConversationId);
      }

      const { error, data } = await supabase.functions.invoke('send-chat-message', {
        body: {
          conversation_id: selectedConversationId,
          lead_id: selectedConversation.lead_id,
          content,
          media_type: media ? media.type : 'text',
          media_url: media?.url,
          chat_id: selectedConversation.gpt_maker_chat_id,
          sender_id: currentUserId,
        }
      });

      if (error) throw error;

      // T10 — Check delivery status
      if (data && typeof data === 'object' && 'delivered' in data && data.delivered === false) {
        toast.warning("Mensagem salva, mas não entregue — verifique os canais conectados.");
      }
    } catch (err) {
      console.error("Erro ao enviar:", err);
      toast.error("Erro ao enviar mensagem");
    }
  };

  const handleToggleHandoff = async () => {
    if (!selectedConversationId || !selectedConversation) return;
    const isHuman = selectedConversation.atendido_por_agente;

    try {
      await sb
        .from('conversations')
        .update({ atendido_por_agente: !isHuman })
        .eq('id', selectedConversationId);

      const chatId = selectedConversation.gpt_maker_chat_id;
      if (chatId) {
        await supabase.functions.invoke('send-chat-message', {
          body: {
            chat_id: chatId,
            action: isHuman ? 'stop_control' : 'take_control'
          }
        });
      }

      toast.success(isHuman ? "Devolvido ao Solo AI" : "Atendimento assumido");
    } catch (err) {
      console.error("Erro ao alternar atendimento:", err);
      toast.error("Erro ao alternar atendimento");
    }
  };

  const handleUpdateCRM = async (data: Partial<ChatSession["crmData"]>) => {
    if (!selectedConversation?.lead_id) return;

    const updates: Record<string, unknown> = {};
    if (data.value !== undefined) updates.opportunity_value = data.value;
    if (data.stage !== undefined) updates.stage_id = data.stage;
    if (data.notes !== undefined) updates.observations = data.notes;

    try {
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', selectedConversation.lead_id);

      refetchLeads();
    } catch (err) {
      console.error("Erro ao atualizar lead:", err);
      toast.error("Erro ao atualizar lead");
    }
  };

  const handleAssignResponsible = async (userId: string | null) => {
    if (!selectedConversationId) return;
    try {
      await sb
        .from('conversations')
        .update({ responsible_id: userId })
        .eq('id', selectedConversationId);
      toast.success(userId ? 'Responsável atribuído' : 'Responsável removido');
    } catch (err) {
      toast.error('Erro ao atribuir responsável');
    }
  };

  const handleConversationStatusChange = (
    conversationId: string,
    status: ConversationStatus,
  ) => {
    updateStatus.mutate(
      { id: conversationId, status },
      {
        onSuccess: () => {
          if (status === 'deleted' && conversationId === selectedConversationId) {
            setSelectedConversationId(null);
          }
        },
      }
    );
  };

  const handleAddTask = async (title: string) => {
    if (!selectedConversation?.lead_id) return;
    await createTask(title);
  };

  const handleToggleTask = async (taskId: string) => {
    await toggleTask(taskId);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    await updateTask(taskId, { status });
  };

  const currentTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due_date: t.due_date,
    createdAt: new Date(t.created_at)
  }));

  const loadingInbox = loadingLeads || loadingConversations;

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-background dark:bg-zinc-950">
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

      {/* Coluna 1: Inbox */}
      <div className={cn(
        "divider-idv-right flex-shrink-0 transition-all duration-300 relative",
        showInbox ? "w-1/4 min-w-[280px] max-w-[360px]" : "w-0 min-w-0 overflow-hidden"
      )}>
        {showInbox && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-7 w-7"
              onClick={() => setShowInbox(false)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {loadingInbox ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
              </div>
            ) : (
              <InboxSidebar
                sessions={sessionsAdapter}
                selectedSessionId={selectedConversationId}
                currentUserId={currentUserId}
                isAdmin={isAdmin()}
                teamMembers={teamMembers}
                onStatusChange={handleConversationStatusChange}
                onSelectSession={(id) => {
                  setSelectedConversationId(id);
                  if (window.innerWidth < 1024) {
                    setShowInbox(false);
                  }
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Coluna 2: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConversationId && selectedSession ? (
          <>
            <div className="flex items-center justify-between divider-idv-bottom">
              <div className="flex-1">
                <ConversationHeader
                  session={selectedSession}
                  teamMembers={teamMembers}
                  onToggleHandoff={handleToggleHandoff}
                  onUpdateCRM={handleUpdateCRM}
                  onAssignResponsible={handleAssignResponsible}
                  onStatusChange={(status) =>
                    handleConversationStatusChange(selectedConversationId, status)
                  }
                  onBack={() => setShowInbox(true)}
                  onOpenLeadDetails={() => setShowLeadModal(true)}
                  onSyncHistory={syncHistory}
                  isSyncingHistory={isSyncingHistory}
                />
              </div>
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
                        onUpdateTaskStatus={handleUpdateTaskStatus}
                        onDeleteTask={handleDeleteTask}
                        onOpenLeadDetails={() => setShowLeadModal(true)}
                    />
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto bg-muted/30 dark:bg-zinc-900/50 relative"
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
                          senderName: msg.sender_type === 'ai'
                            ? (selectedConversation?.agent_name || 'Solo AI')
                            : msg.sender_type === 'agent'
                              ? (() => {
                                  const sid = (msg as any).sender_id;
                                  if (sid) {
                                    const member = teamMembers.find(m => m.id === sid);
                                    if (member) return member.nome_completo || member.email || selectedConversation?.agent_name || 'Solo AI';
                                  }
                                  return selectedConversation?.agent_name || 'Solo AI';
                                })()
                              : undefined,
                        }}
                      />
                    ))
                )}
                <div ref={messagesEndRef} />
              </div>
              {showJumpToLatest && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToBottom("smooth")}
                  className="sticky bottom-3 left-1/2 -translate-x-1/2 z-10 h-8 gap-1.5 px-3 rounded-full shadow-md ring-1 ring-border bg-background/90 backdrop-blur"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  Ir para o final
                </Button>
              )}
            </div>

            <ChatInput
              onSend={handleSendMessage}
              placeholder="Digite sua mensagem..."
              disabled={loadingMessages}
              leadId={selectedConversation?.lead_id ?? undefined}
              hasSoloInstance={hasSoloInstance}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para iniciar o atendimento</p>
            </div>
          </div>
        )}
      </div>

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

      <div className={cn(
        "divider-idv-left hidden lg:block flex-shrink-0 overflow-hidden transition-all duration-300 relative",
        showCRM ? "w-80" : "w-0"
      )}>
        {showCRM && (
          <>
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
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onDeleteTask={handleDeleteTask}
                onOpenLeadDetails={() => setShowLeadModal(true)}
            />
          </>
        )}
      </div>

      <ContactDetailsModal
        lead={(selectedLead as Lead) || null}
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        onSave={(data) => {
          updateLead.mutate(data);
          setShowLeadModal(false);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setSelectedConversationId(null);
          setShowLeadModal(false);
        }}
      />
    </div>
  );
};

export default Chat;
