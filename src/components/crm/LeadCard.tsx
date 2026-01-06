import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Calendar, DollarSign, CheckCircle, Clock, XCircle, MessageCircle } from "lucide-react";
import { Lead } from "@/types/crm";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { SLAIndicator } from "./SLAIndicator";

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
}

export const LeadCard = ({ lead, onClick }: LeadCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatCurrency = (value: number | null) => {
    if (!value || value === 0) return null;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getSourceBadge = (lead: Lead) => {
    // Prioriza source, fallback para creation_source
    const source = lead.source?.toLowerCase() || '';
    const creationSource = lead.creation_source || '';
    
    // IA (agente)
    if (source === 'ia' || creationSource === 'ai_agent') {
      return <Badge variant="default" className="bg-violet-500/90 text-xs flex items-center gap-1">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        IA
      </Badge>;
    }
    
    // Ads (tráfego pago)
    if (source === 'ads') {
      return <Badge variant="default" className="bg-amber-500/90 text-xs flex items-center gap-1">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
        Ads
      </Badge>;
    }
    
    // Manual (default)
    return <Badge variant="outline" className="text-xs flex items-center gap-1">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      Manual
    </Badge>;
  };

  const cleanPhoneNumber = (phone: string): string => {
    return phone.replace(/[\s\-().]/g, "");
  };

  const isValidPhoneNumber = (phone: string): boolean => {
    const cleaned = cleanPhoneNumber(phone);
    return cleaned.length >= 10 && cleaned.length <= 15;
  };

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!lead.phone) {
      toast.error("Lead sem telefone cadastrado");
      return;
    }

    const cleanedPhone = cleanPhoneNumber(lead.phone);

    if (!isValidPhoneNumber(lead.phone)) {
      toast.error("Número de telefone inválido");
      return;
    }

    // Add Brazil country code if not present
    const phoneWithCountry = cleanedPhone.startsWith("55")
      ? cleanedPhone
      : `55${cleanedPhone}`;

    window.open(`https://wa.me/${phoneWithCountry}`, "_blank");
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        p-3 cursor-pointer transition-all duration-200
        hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5
        bg-card border-border
        ${isDragging ? "opacity-50 shadow-lg scale-105 z-50" : ""}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm text-foreground truncate flex-1">
          {lead.name}
        </h4>
        <div className="flex items-center gap-1.5">
          {lead.phone && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
              onClick={handleWhatsAppClick}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
          )}
          {getSourceBadge(lead)}
        </div>
      </div>

      {/* Contact Info */}
      <div className="space-y-1 mb-3">
        {lead.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>

      {/* Value */}
      {lead.opportunity_value && lead.opportunity_value > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <DollarSign className="h-3.5 w-3.5 text-green-500" />
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(lead.opportunity_value)}
          </span>
        </div>
      )}

      {/* Status Badges */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {lead.meeting_scheduled && (
          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
            <Calendar className="h-3 w-3 mr-1" />
            Agendada
          </Badge>
        )}
        {lead.meeting_done && (
          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Realizada
          </Badge>
        )}
        {lead.no_show && (
          <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            No Show
          </Badge>
        )}
      </div>

      {/* Tags */}
      {lead.tags && lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {lead.tags.slice(0, 3).map((tag, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="text-xs px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
          {lead.tags.length > 3 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              +{lead.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* SLA + Next Contact */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <SLAIndicator stageEnteredAt={lead.stage_entered_at} compact />
        {lead.next_contact && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {format(new Date(lead.next_contact), "dd/MM", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
