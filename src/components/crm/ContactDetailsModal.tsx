import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  X,
  Plus,
  Phone,
  Mail,
  User,
  Clock,
  MessageSquare,
  MessagesSquare,
  Send,
  Loader2,
  CheckCircle2,
  PhoneCall,
  Video,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import type { Lead, ContactType, OriginCategory } from "@/types/crm";
import { LeadOpportunitiesSection } from "./LeadOpportunitiesSection";
import { DynamicFieldRenderer } from "./DynamicFieldRenderer";
import { CompanySection } from "./companies/CompanySection";
import { PropertySection } from "./properties/PropertySection";
import { CONTACT_ENRICHMENT_SCHEMA } from "@/config/contactEnrichmentSchema";
import {
  ORIGIN_CATEGORY_OPTIONS,
  ORIGIN_GROUPS,
  ORIGIN_GROUP_LABELS,
  originOptionsByGroup,
} from "@/config/originTaxonomy";
import { useLeadActivities } from "@/hooks/useLeadActivities";
import { useTouchpoints } from "@/hooks/useTouchpoints";
import { useTasks } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

interface ContactDetailsModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: { id: string } & Partial<Lead>) => void;
  onDelete: (id: string) => void;
}

const CONTACT_TYPE_OPTIONS: Array<{ value: ContactType; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Oportunidade" },
  { value: "contact", label: "Contato" },
  { value: "spam", label: "Spam" },
  { value: "archived", label: "Arquivado" },
];

const CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "messenger", label: "Messenger" },
  { value: "web", label: "Web" },
  { value: "email", label: "Email" },
  { value: "manual", label: "Manual" },
];

/**
 * Sprint 4 EPIC 3 §3.4 — identity-only contact editor. All per-pipeline
 * sales fields (stage, value, meeting state, responsible, next contact)
 * moved to the Opportunity. Users edit those per-pipeline inside the
 * embedded `LeadOpportunitiesSection`.
 */
export const ContactDetailsModal = ({
  lead,
  open,
  onClose,
  onSave,
  onDelete,
}: ContactDetailsModalProps) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Partial<Lead>>({});
  const [newTag, setNewTag] = useState("");
  const [noteText, setNoteText] = useState("");

  const { activities, isLoading: isLoadingActivities, createActivity } = useLeadActivities(lead?.id);
  const { touchpoints, isLoading: isLoadingTouchpoints } = useTouchpoints(lead?.id);
  const { tasks, isLoading: isLoadingTasks } = useTasks(lead?.id || null);

  const combinedActivities = useMemo(() => {
    const items: Array<{
      id: string;
      type: "note" | "touchpoint" | "task";
      title: string;
      description?: string;
      date: Date;
      icon: "note" | "call" | "email" | "whatsapp" | "meeting" | "task";
      status?: string;
    }> = [];

    activities.forEach((activity) => {
      items.push({
        id: activity.id,
        type: "note",
        title: activity.tipo,
        description: activity.descricao || undefined,
        date: new Date(activity.created_at),
        icon: "note",
      });
    });

    touchpoints.forEach((tp) => {
      items.push({
        id: tp.id,
        type: "touchpoint",
        title: tp.touchpoint_type || "note",
        description: tp.content,
        date: new Date(tp.contact_date),
        icon: (tp.touchpoint_type as "call" | "email" | "whatsapp" | "meeting" | "note") || "note",
      });
    });

    tasks.forEach((task) => {
      items.push({
        id: task.id,
        type: "task",
        title: task.title,
        description: task.description || undefined,
        date: new Date(task.created_at),
        icon: "task",
        status: task.status,
      });
    });

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
    } catch {
      toast.error("Erro ao adicionar nota");
    }
  };

  const enrichmentValue =
    (formData.personal_custom_data as Record<string, unknown>) ?? {};

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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Detalhes do Contato
            {/* T15 — rota de chat do produto: abre a conversa nativa deste contato */}
            {lead?.id && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto mr-8 h-8 gap-1.5 text-primary"
                onClick={() => {
                  const id = lead.id;
                  onClose();
                  navigate(`/chat?contact=${id}`);
                }}
              >
                <MessagesSquare className="h-4 w-4" />
                Abrir no Chat
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-0 flex-1 min-h-0 overflow-hidden">
          {/* Left Column - Identity + Enrichment + Opportunities (2/3) */}
          <div className="md:col-span-2 border-r border-border overflow-hidden">
            <ScrollArea className="h-[calc(90vh-180px)]">
              <div className="p-6 space-y-6">
                {/* Identity block */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Nome</Label>
                    <div className="relative mt-1.5">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        className="pl-9"
                        value={formData.name || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, name: e.target.value }))
                        }
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

                  <div>
                    <Label>Canal</Label>
                    <Select
                      value={formData.channel || "__none__"}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          channel: value === "__none__" ? null : value,
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {CHANNEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={formData.contact_type || "lead"}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          contact_type: value as ContactType,
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Origem</Label>
                    <Select
                      value={formData.origin_category || "__none__"}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          origin_category:
                            value === "__none__" ? null : (value as OriginCategory),
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {ORIGIN_GROUPS.map((group) => (
                          <SelectGroup key={group}>
                            <SelectLabel>{ORIGIN_GROUP_LABELS[group]}</SelectLabel>
                            {originOptionsByGroup(group).map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="origin_detail">Detalhe da Origem</Label>
                    <Input
                      id="origin_detail"
                      className="mt-1.5"
                      value={formData.origin_detail || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, origin_detail: e.target.value }))
                      }
                      placeholder="Ex.: nome da campanha, evento, indicador..."
                    />
                  </div>
                </div>

                {/* Enrichment block — personal_custom_data via DynamicFieldRenderer */}
                <div className="pt-4 border-t border-border">
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                    Enriquecimento
                  </h4>
                  <DynamicFieldRenderer
                    schema={CONTACT_ENRICHMENT_SCHEMA}
                    value={enrichmentValue}
                    onChange={(next) =>
                      setFormData((prev) => ({ ...prev, personal_custom_data: next }))
                    }
                  />
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
                    placeholder="Adicione anotações sobre este contato..."
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
                </div>

                {/* Sprint 4 EPIC 4 — companies + properties linked to this contact */}
                {lead?.id && (
                  <div className="pt-4 border-t border-border">
                    <CompanySection mode={{ kind: "contact", contactId: lead.id }} />
                  </div>
                )}

                {lead?.id && (
                  <div className="pt-4 border-t border-border">
                    <PropertySection
                      mode={{ kind: "owner", ownerType: "contact", ownerId: lead.id }}
                    />
                  </div>
                )}

                {/* Cross-pipeline opportunities — users edit per-pipeline sales data here */}
                <div className="pt-4 border-t border-border">
                  {lead?.id && <LeadOpportunitiesSection leadId={lead.id} />}
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
                      <div
                        className={cn(
                          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                          item.type === "task" && item.status === "feito"
                            ? "bg-green-500/10 text-green-600"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {getActivityIcon(item.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium capitalize">
                            {item.type === "task"
                              ? "Tarefa"
                              : item.type === "touchpoint"
                                ? item.icon === "call"
                                  ? "Ligação"
                                  : item.icon === "email"
                                    ? "Email"
                                    : item.icon === "whatsapp"
                                      ? "WhatsApp"
                                      : item.icon === "meeting"
                                        ? "Reunião"
                                        : "Nota"
                                : item.title}
                          </p>
                          {item.type === "task" && item.status === "feito" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 bg-green-500/10 text-green-600 border-green-500/30"
                            >
                              Concluída
                            </Badge>
                          )}
                        </div>
                        {(item.description || (item.type === "task" && item.title)) && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.type === "task" ? item.title : item.description}
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
