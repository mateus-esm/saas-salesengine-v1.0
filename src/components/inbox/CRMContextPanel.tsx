import { useState, useEffect } from "react";
import { ChatSession, Task } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  ExternalLink,
  Mail,
  Phone,
  Building,
  Briefcase,
  Plus,
  X,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { TouchpointsList } from "@/components/crm/TouchpointsList";
import { SLAIndicator } from "@/components/crm/SLAIndicator";

interface CRMContextPanelProps {
  session: ChatSession | null;
  tasks: Task[];
  onUpdateCRM: (data: Partial<ChatSession["crmData"]>) => void;
  onAddTask: (title: string) => void;
  onToggleTask: (taskId: string) => void;
  stageEnteredAt?: string | null;
}

export function CRMContextPanel({
  session,
  tasks,
  onUpdateCRM,
  onAddTask,
  onToggleTask,
  stageEnteredAt,
}: CRMContextPanelProps) {
  const [activeTab, setActiveTab] = useState("notes");
  const [newTask, setNewTask] = useState("");
  const [notes, setNotes] = useState(session?.crmData.notes || "");
  const { stages } = usePipelineStages();

  // Atualiza notes quando session muda
  useEffect(() => {
    setNotes(session?.crmData.notes || "");
  }, [session?.crmData.notes]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Selecione uma conversa</p>
      </div>
    );
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleNotesBlur = () => {
    if (notes !== session.crmData.notes) {
      onUpdateCRM({ notes });
      toast.success("Notas salvas");
    }
  };

  const handleAddTask = () => {
    if (newTask.trim()) {
      onAddTask(newTask.trim());
      setNewTask("");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Lead Card Header */}
      <Card className="m-3 mb-0">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{session.customerName}</CardTitle>
              {session.crmData.position && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Briefcase className="h-3 w-3" />
                  {session.crmData.position}
                </p>
              )}
              {session.crmData.company && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {session.crmData.company}
                </p>
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={() => {
                const phone = session.customerPhone.replace(/\D/g, '');
                const phoneWithCountry = phone.startsWith('55') ? phone : `55${phone}`;
                window.open(`https://wa.me/${phoneWithCountry}`, '_blank');
              }}
            >
              <MessageCircle className="h-3 w-3" />
              WhatsApp
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Contact info */}
          <div className="space-y-2">
            {session.crmData.email && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {session.crmData.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(session.crmData.email!, "Email")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                {session.customerPhone}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(session.customerPhone, "Telefone")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Tags */}
          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {session.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                  <button className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Data (Editable) */}
      <div className="p-3 space-y-3 border-b border-border">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Valor da Oportunidade
          </label>
          <Input
            type="text"
            value={formatCurrency(session.crmData.value)}
            className="h-9"
            onChange={(e) => {
              const value = parseFloat(e.target.value.replace(/\D/g, "")) / 100;
              onUpdateCRM({ value });
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Etapa do Funil
          </label>
          <Select
            value={session.crmData.stage}
            onValueChange={(stage) => onUpdateCRM({ stage })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-3 w-auto">
          <TabsTrigger value="notes" className="flex-1">
            Notas
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex-1">
            Tarefas
          </TabsTrigger>
          <TabsTrigger value="touchpoints" className="flex-1">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="flex-1 p-3 pt-2 m-0 flex flex-col">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione anotações sobre este lead..."
            className="flex-1 min-h-[120px] resize-none"
          />
          <Button
            size="sm"
            className="mt-2"
            onClick={handleNotesBlur}
            disabled={notes === session.crmData.notes}
          >
            Salvar Notas
          </Button>
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 p-3 pt-2 m-0 overflow-auto">
          <div className="space-y-2">
            {/* Add task input */}
            <div className="flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Nova tarefa..."
                className="h-9"
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
              />
              <Button size="sm" onClick={handleAddTask} disabled={!newTask.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Task list */}
            <div className="space-y-2 mt-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                >
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => onToggleTask(task.id)}
                  />
                  <span
                    className={`text-sm flex-1 ${
                      task.completed ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma tarefa
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="touchpoints" className="flex-1 p-3 pt-2 m-0 overflow-auto">
          {session?.leadId && <TouchpointsList leadId={session.leadId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
