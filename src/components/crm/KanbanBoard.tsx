import { useState, useMemo, useCallback, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";
import { LeadDetailsModal } from "./LeadDetailsModal";
import { AddLeadModal } from "./AddLeadModal";
import { StageManagerModal } from "./StageManagerModal";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Settings, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLeads } from "@/hooks/useLeads";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Lead, PipelineStage } from "@/types/crm";

export const KanbanBoard = () => {
  const { profile, equipe, loading: authLoading } = useAuth();
  const { 
    leads, 
    isLoading: leadsLoading, 
    createLead, 
    updateLead, 
    deleteLead, 
    moveLeadToStage,
    refetch: refetchLeads 
  } = useLeads();
  
  const { 
    stages, 
    isLoading: stagesLoading,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    refetch: refetchStages 
  } = usePipelineStages();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStageManager, setShowStageManager] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Subscribe to realtime updates
  useEffect(() => {
    if (!profile?.equipe_id) return;

    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `equipe_id=eq.${profile.equipe_id}`,
        },
        () => {
          refetchLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.equipe_id, refetchLeads]);

  // Group leads by stage
  const leadsByStage = useMemo(() => {
    const grouped: Record<string, Lead[]> = {};
    
    stages.forEach((stage) => {
      grouped[stage.id] = [];
    });
    grouped["no_stage"] = [];
    
    leads.forEach((lead) => {
      if (lead.stage_id && grouped[lead.stage_id]) {
        grouped[lead.stage_id].push(lead);
      } else {
        grouped["no_stage"].push(lead);
      }
    });
    
    return grouped;
  }, [leads, stages]);

  const activeLead = useMemo(
    () => leads.find((l) => l.id === activeId),
    [leads, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;

    // Check if dropped over a stage (column)
    const targetStage = stages.find((s) => s.id === overId);
    if (targetStage) {
      moveLeadToStage.mutate({ leadId, stageId: targetStage.id });
      return;
    }

    // Check if dropped over another lead (find its stage)
    const targetLead = leads.find((l) => l.id === overId);
    if (targetLead && targetLead.stage_id) {
      moveLeadToStage.mutate({ leadId, stageId: targetLead.stage_id });
    }
  };

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setShowDetailsModal(true);
  };

  const handleUpdateLead = useCallback((data: { id: string } & Partial<Lead>) => {
    updateLead.mutate({
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      observations: data.observations,
      next_contact: data.next_contact,
      meeting_scheduled: data.meeting_scheduled,
      meeting_done: data.meeting_done,
      no_show: data.no_show,
      opportunity_value: data.opportunity_value,
      stage_id: data.stage_id,
      tags: data.tags || [],
    });
    
    setShowDetailsModal(false);
    setSelectedLead(null);
  }, [updateLead]);

  const handleDeleteLead = useCallback((id: string) => {
    deleteLead.mutate(id);
    setShowDetailsModal(false);
    setSelectedLead(null);
  }, [deleteLead]);

  const handleAddLead = useCallback((data: { 
    name: string; 
    email?: string; 
    phone?: string; 
    stage_id?: string; 
    observations?: string; 
    source?: string;
    opportunity_value?: number;
  }) => {
    createLead.mutate({
      name: data.name,
      email: data.email,
      phone: data.phone,
      stage_id: data.stage_id || stages[0]?.id,
      observations: data.observations,
      source: data.source || "manual",
      opportunity_value: data.opportunity_value,
    });
    setShowAddModal(false);
  }, [createLead, stages]);

  // Stage management
  const handleUpdateStage = useCallback((id: string, updates: Partial<PipelineStage>) => {
    updateStage.mutate({ id, ...updates });
  }, [updateStage]);

  const handleAddStage = useCallback((name: string, color: string) => {
    createStage.mutate({ name, color });
  }, [createStage]);

  const handleDeleteStage = useCallback((id: string) => {
    deleteStage.mutate(id);
  }, [deleteStage]);

  const handleReorderStages = useCallback((orderedIds: string[]) => {
    reorderStages.mutate(orderedIds);
  }, [reorderStages]);

  const handleRefresh = () => {
    refetchLeads();
    refetchStages();
    toast.success("Dados atualizados!");
  };

  // Webhook URL for integration
  const webhookUrl = equipe?.webhook_secret 
    ? `https://padduteanashekmereof.supabase.co/functions/v1/crm-webhook?secret=${equipe.webhook_secret}`
    : "";

  const isLoading = leadsLoading || stagesLoading;

  // Wait for auth to load before checking team
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if user has no team assigned
  if (!profile?.equipe_id) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
            <Settings className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Configuração Necessária</h2>
          <p className="text-muted-foreground">
            Você ainda não foi atribuído a uma equipe. Entre em contato com o administrador para ser adicionado a uma equipe e começar a usar o CRM.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading && leads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Pipeline <span className="text-primary">Comercial</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} leads • {stages.length} etapas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStageManager(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Etapas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4 bg-muted/30">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-h-[500px]">
            <SortableContext
              items={stages.map((s) => s.id)}
              strategy={horizontalListSortingStrategy}
            >
              {stages
                .sort((a, b) => a.position - b.position)
                .map((stage) => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    leads={leadsByStage[stage.id] || []}
                    onLeadClick={handleLeadClick}
                  />
                ))}
            </SortableContext>

            {/* No Stage Column */}
            {leadsByStage["no_stage"]?.length > 0 && (
              <KanbanColumn
                stage={{
                  id: "no_stage",
                  equipe_id: profile?.equipe_id || "",
                  name: "Sem Etapa",
                  position: 999,
                  color: "#6b7280",
                  is_default: false,
                  created_at: new Date().toISOString(),
                }}
                leads={leadsByStage["no_stage"]}
                onLeadClick={handleLeadClick}
              />
            )}
          </div>

          <DragOverlay>
            {activeLead && (
              <div className="opacity-90 rotate-2 scale-105">
                <LeadCard lead={activeLead} onClick={() => {}} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modals */}
      <LeadDetailsModal
        lead={selectedLead}
        stages={stages}
        open={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedLead(null);
        }}
        onSave={handleUpdateLead}
        onDelete={handleDeleteLead}
      />

      <AddLeadModal
        open={showAddModal}
        stages={stages}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddLead}
      />

      <StageManagerModal
        open={showStageManager}
        stages={stages}
        webhookUrl={webhookUrl}
        onClose={() => setShowStageManager(false)}
        onUpdateStage={handleUpdateStage}
        onAddStage={handleAddStage}
        onDeleteStage={handleDeleteStage}
        onReorderStages={handleReorderStages}
      />
    </div>
  );
};
