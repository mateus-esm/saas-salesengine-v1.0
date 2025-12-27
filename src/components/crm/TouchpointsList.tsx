import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Mail, MessageCircle, Calendar as CalendarIcon, FileText, Plus, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTouchpoints, CreateTouchpointData } from "@/hooks/useTouchpoints";

interface TouchpointsListProps {
  leadId: string;
}

const TOUCHPOINT_TYPES = [
  { value: 'call', label: 'Ligação', icon: Phone, color: 'bg-blue-500/10 text-blue-600' },
  { value: 'email', label: 'Email', icon: Mail, color: 'bg-purple-500/10 text-purple-600' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'bg-green-500/10 text-green-600' },
  { value: 'meeting', label: 'Reunião', icon: CalendarIcon, color: 'bg-orange-500/10 text-orange-600' },
  { value: 'note', label: 'Nota', icon: FileText, color: 'bg-gray-500/10 text-gray-600' },
] as const;

export function TouchpointsList({ leadId }: TouchpointsListProps) {
  const { touchpoints, isLoading, createTouchpoint, deleteTouchpoint } = useTouchpoints(leadId);
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<CreateTouchpointData['touchpoint_type']>('note');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const handleAdd = () => {
    if (!newContent.trim()) return;
    
    createTouchpoint.mutate({
      lead_id: leadId,
      touchpoint_type: newType,
      content: newContent.trim(),
      contact_date: format(selectedDate, 'yyyy-MM-dd'),
    });
    
    setNewContent("");
    setSelectedDate(new Date());
  };

  const getTypeConfig = (type: string) => {
    return TOUCHPOINT_TYPES.find(t => t.value === type) || TOUCHPOINT_TYPES[4];
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Quick Add Form */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={newType} onValueChange={(v) => setNewType(v as CreateTouchpointData['touchpoint_type'])}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOUCHPOINT_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3 w-3" />
                      {type.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-28 justify-start text-left font-normal">
                <CalendarIcon className="mr-1 h-3 w-3" />
                {format(selectedDate, "dd/MM", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-2">
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Descreva o contato..."
            className="h-9 flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button 
            size="sm" 
            onClick={handleAdd} 
            disabled={!newContent.trim() || createTouchpoint.isPending}
          >
            {createTouchpoint.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Touchpoints List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {touchpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum touchpoint registrado
          </p>
        ) : (
          touchpoints.map((tp) => {
            const config = getTypeConfig(tp.touchpoint_type);
            const Icon = config.icon;
            
            return (
              <div
                key={tp.id}
                className="flex items-start gap-2 p-2 rounded-md bg-muted/50 group"
              >
                <Badge variant="outline" className={`${config.color} shrink-0`}>
                  <Icon className="h-3 w-3" />
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{tp.content}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(tp.contact_date), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteTouchpoint.mutate(tp.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
