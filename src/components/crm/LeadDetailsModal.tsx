import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  CalendarIcon, 
  Trash2, 
  X, 
  Plus, 
  Phone, 
  Mail, 
  DollarSign, 
  User,
  Clock,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  PhoneCall,
  Video,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lead, PipelineStage } from "@/types/crm";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useLeadActivities } from "@/hooks/useLeadActivities";
import { useTouchpoints } from "@/hooks/useTouchpoints";
import { useTasks } from "@/hooks/useTasks";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LeadDetailsModalProps {
  lead: Lead | null;
  stages: PipelineStage[];
  open: boolean;
  onClose: () => void;
  onSave: (data: { id: string } & Partial<Lead>) => void;
  onDelete: (id: string) => void;
}

export const LeadDetailsModal = ({
  lead,
  stages,
  open,
  onClose,
  onSave,
  onDelete,
}: LeadDetailsModalProps) => {
  const [formData, setFormData] = useState<Partial<Lead>>({});
  const [newTag, setNewTag] = useState("");
  const [noteText, setNoteText] = useState("");
  
  const { teamMembers, isLoading: isLoadingMembers } = useTeamMembers();
  const { activities, isLoading: isLoadingActivities, createActivity } = useLeadActivities(lead?.id);
  const { touchpoints, isLoading: isLoadingTouchpoints } = useTouchpoints(lead?.id);
  const { tasks, isLoading: isLoadingTasks } = useTasks(lead?.id || null);
  const { tenant } = useTenant();

  // Combine all activities for unified timeline
  const combinedActivities = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'note' | 'touchpoint' | 'task';
      title: string;
      description?: string;
      date: Date;
      icon: 'note' | 'call' | 'email' | 'whatsapp' | 'meeting' | 'task';
      status?: string;
    }> = [];

    // Add activities (notes)
    activities.forEach(activity => {
      items.push({
        id: activity.id,
        type: 'note',
        title: activity.tipo,
        description: activity.descricao || undefined,
        date: new Date(activity.created_at),
        icon: 'note',
      });
    });

    // Add touchpoints
    touchpoints.forEach(tp => {
      items.push({
        id: tp.id,
        type: 'touchpoint',
        title: tp.touchpoint_type || 'note',
        description: tp.content,
        date: new Date(tp.contact_date),
        icon: (tp.touchpoint_type as 'call' | 'email' | 'whatsapp' | 'meeting' | 'note') || 'note',
      });
    });

    // Add tasks
    tasks.forEach(task => {
      items.push({
        id: task.id,
        type: 'task',
        title: task.title,
        description: task.description || undefined,
        date: new Date(task.created_at),
        icon: 'task',
        status: task.status,
      });
    });

    // Sort by date descending
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [activities, touchpoints, tasks]);

  useEffect(() => {
    if (lead) {
      setFormData({ ...lead });
      setNoteText("");
    }
  }, [lead]);

  if (!lead) return null;

  const handleSave = () => {
    onSave({ ...formData, id: lead.id } as { id: string } & Partial<Lead>);
  };

  const handleAddTag = () => {
    if (newTag.trim()) {
      setFormData((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()],
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      toast.error("Digite uma nota antes de adicionar");
      return;
    }

    try {
      await createActivity.mutateAsync({
        lead_id: lead.id,
        tipo: "nota",
        descricao: noteText.trim(),
        metadata: { criado_manualmente: true },
      });
      setNoteText("");
      toast.success("Nota adicionada com sucesso");
    } catch (error) {
      toast.error("Erro ao adicionar nota");
    }
  };

  const handleCustomFieldChange = (key: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      custom_fields: {
        ...(prev.custom_fields || {}),
        [key]: value,
      },
    }));
  };

  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const number = parseInt(numericValue, 10) / 100;
    return number.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const parseCurrency = (value: string): number => {
    const numericValue = value.replace(/\D/g, "");
    return parseInt(numericValue, 10) / 100;
  };

  const getActivityIcon = (iconType: string) => {
    switch (iconType) {
      case "nota":
      case "note":
        return <FileText className="h-3 w-3" />;
      case "ligacao":
      case "call":
        return <PhoneCall className="h-3 w-3" />;
      case "email":
        return <Mail className="h-3 w-3" />;
      case "whatsapp":
        return <MessageSquare className="h-3 w-3" />;
      case "meeting":
        return <Video className="h-3 w-3" />;
      case "task":
        return <CheckCircle2 className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const customFields = tenant?.customFields || [];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Detalhes do Lead
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-0 flex-1 min-h-0 overflow-hidden">
          {/* Left Column - Data & Actions (2/3) */}
          <div className="md:col-span-2 border-r border-border overflow-hidden">
            <ScrollArea className="h-[calc(90vh-180px)]">
              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="stage">Etapa</Label>
                    <Select
                      value={formData.stage_id || ""}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, stage_id: value }))
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione uma etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="responsible">Responsável</Label>
                    <Select
                      value={formData.responsible_id || "__none__"}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ 
                          ...prev, 
                          responsible_id: value === "__none__" ? null : value 
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder={isLoadingMembers ? "Carregando..." : "Selecionar responsável"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3" />
                              {member.nome_completo || member.email || "Usuário"}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="opportunity_value">Valor da Oportunidade</Label>
                    <div className="relative mt-1.5">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="opportunity_value"
                        className="pl-9"
                        value={
                          formData.opportunity_value
                            ? formatCurrency(String(formData.opportunity_value * 100))
                            : ""
                        }
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            opportunity_value: parseCurrency(e.target.value),
                          }))
                        }
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <div className="relative mt-1.5">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        className="pl-9"
                        value={formData.phone || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        className="pl-9"
                        value={formData.email || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Fields by Niche */}
                {customFields.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-3 block">
                      Campos do {tenant?.name || "Nicho"}
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      {customFields.map((field) => (
                        <div key={field.key}>
                          <Label htmlFor={field.key} className="text-xs text-muted-foreground">
                            {field.label}
                          </Label>
                          {field.type === "select" && field.options ? (
                            <Select
                              value={String(formData.custom_fields?.[field.key] || "")}
                              onValueChange={(value) =>
                                handleCustomFieldChange(field.key, value)
                              }
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder={`Selecionar ${field.label}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={field.key}
                              type={field.type === "number" ? "number" : "text"}
                              className="mt-1"
                              placeholder={field.placeholder}
                              value={String(formData.custom_fields?.[field.key] || "")}
                              onChange={(e) =>
                                handleCustomFieldChange(
                                  field.key,
                                  field.type === "number" ? Number(e.target.value) : e.target.value
                                )
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meeting Date */}
                <div>
                  <Label>Data da Reunião</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full mt-1.5 justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.meeting_date
                          ? format(new Date(formData.meeting_date), "PPP 'às' HH:mm", {
                              locale: ptBR,
                            })
                          : "Selecionar data e hora"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          formData.meeting_date
                            ? new Date(formData.meeting_date)
                            : undefined
                        }
                        onSelect={(date) =>
                          setFormData((prev) => ({
                            ...prev,
                            meeting_date: date?.toISOString() || null,
                            meeting_scheduled: !!date,
                          }))
                        }
                        locale={ptBR}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Meeting Notes */}
                <div>
                  <Label htmlFor="meeting_notes">Pauta/Link da Reunião</Label>
                  <Input
                    id="meeting_notes"
                    value={formData.meeting_notes || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, meeting_notes: e.target.value }))
                    }
                    className="mt-1.5"
                    placeholder="Link do meet, pauta, etc."
                  />
                </div>

                {/* Status Checkboxes */}
                <div>
                  <Label>Status</Label>
                  <div className="flex flex-wrap gap-6 mt-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="meeting_scheduled"
                        checked={formData.meeting_scheduled || false}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({
                            ...prev,
                            meeting_scheduled: checked as boolean,
                          }))
                        }
                      />
                      <Label htmlFor="meeting_scheduled" className="font-normal cursor-pointer">
                        Reunião Agendada
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="meeting_done"
                        checked={formData.meeting_done || false}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({
                            ...prev,
                            meeting_done: checked as boolean,
                          }))
                        }
                      />
                      <Label htmlFor="meeting_done" className="font-normal cursor-pointer">
                        Reunião Realizada
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="no_show"
                        checked={formData.no_show || false}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({
                            ...prev,
                            no_show: checked as boolean,
                          }))
                        }
                      />
                      <Label htmlFor="no_show" className="font-normal cursor-pointer">
                        No Show
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(formData.tags || []).map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <div className="flex gap-1">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                        placeholder="Nova tag..."
                        className="h-7 w-24 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddTag}
                        className="h-7 px-2"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Next Contact */}
                <div>
                  <Label>Próximo Contato</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full mt-1.5 justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.next_contact
                          ? format(new Date(formData.next_contact), "PPP", {
                              locale: ptBR,
                            })
                          : "Selecionar data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          formData.next_contact
                            ? new Date(formData.next_contact)
                            : undefined
                        }
                        onSelect={(date) =>
                          setFormData((prev) => ({
                            ...prev,
                            next_contact: date?.toISOString() || null,
                          }))
                        }
                        locale={ptBR}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Observations */}
                <div>
                  <Label htmlFor="observations">Observações</Label>
                  <Textarea
                    id="observations"
                    value={formData.observations || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, observations: e.target.value }))
                    }
                    rows={3}
                    className="mt-1.5 resize-none"
                    placeholder="Adicione anotações sobre este lead..."
                  />
                </div>

                {/* Meta Info */}
                <div className="text-xs text-muted-foreground pt-4 border-t border-border">
                  <p>
                    Criado em:{" "}
                    {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                  <p>
                    Última atualização:{" "}
                    {format(new Date(lead.updated_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </p>
                  <p>Origem: {lead.origem || "manual"}</p>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Column - Timeline & Notes (1/3) */}
          <div className="flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border shrink-0">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Histórico de Atividades
              </h3>
            </div>

            {/* Activities List */}
            <ScrollArea className="flex-1 max-h-[calc(90vh-300px)]">
              <div className="p-4 space-y-3">
                {(isLoadingActivities || isLoadingTouchpoints || isLoadingTasks) ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : combinedActivities.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nenhuma atividade registrada
                  </p>
                ) : (
                  combinedActivities.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex gap-3 p-3 rounded-lg bg-muted/50 border border-border"
                    >
                      <div className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                        item.type === 'task' && item.status === 'done' 
                          ? "bg-green-500/10 text-green-600" 
                          : "bg-primary/10 text-primary"
                      )}>
                        {getActivityIcon(item.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium capitalize">
                            {item.type === 'task' ? 'Tarefa' : 
                             item.type === 'touchpoint' ? 
                               (item.icon === 'call' ? 'Ligação' : 
                                item.icon === 'email' ? 'Email' : 
                                item.icon === 'whatsapp' ? 'WhatsApp' : 
                                item.icon === 'meeting' ? 'Reunião' : 'Nota') :
                             item.title}
                          </p>
                          {item.type === 'task' && item.status === 'done' && (
                            <Badge variant="outline" className="text-[10px] h-4 bg-green-500/10 text-green-600 border-green-500/30">
                              Concluída
                            </Badge>
                          )}
                        </div>
                        {(item.description || (item.type === 'task' && item.title)) && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.type === 'task' ? item.title : item.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {format(item.date, "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Add Note Input - Fixed at Bottom */}
            <div className="p-3 border-t border-border bg-background">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Adicionar uma nota rápida..."
                className="min-h-[60px] text-xs mb-2 resize-none"
              />
              <Button
                size="sm"
                className="w-full h-8"
                onClick={handleAddNote}
                disabled={createActivity.isPending || !noteText.trim()}
              >
                {createActivity.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3 mr-2" />
                    Adicionar Nota
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-border p-4">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onDelete(lead.id)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
