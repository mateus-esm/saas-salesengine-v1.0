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
  Copy,
  Mail,
  Phone,
  Building,
  Briefcase,
  Plus,
  X,
  MessageCircle,
  Sparkles,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { TouchpointsList } from "@/components/crm/TouchpointsList";
import { LeadOpportunitiesSection } from "@/components/crm/LeadOpportunitiesSection";

interface CRMContextPanelProps {
  session: ChatSession | null;
  tasks: Task[];
  onUpdateCRM: (data: Partial<ChatSession["crmData"]>) => void;
  onAddTask: (title: string) => void;
  onToggleTask: (taskId: string) => void;
  stageEnteredAt?: string | null;
  onOpenLeadDetails?: () => void;
}

export function CRMContextPanel({
  session,
  tasks,
  onUpdateCRM,
  onAddTask,
  onToggleTask,
  onOpenLeadDetails,
}: CRMContextPanelProps) {
  const [activeTab, setActiveTab] = useState("notes");
  const [newTask, setNewTask] = useState("");
  const [notes, setNotes] = useState(session?.crmData.notes || "");

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sprint 5.5 1.4 + polish — Identity + Connected Properties + Copilot
          scroll independently from the Notes/Tasks/History tabs below. All
          decorative icons normalized to h-3.5 w-3.5; section padding
          consistent at px-3 with space-y-3 between them so the panel feels
          calm at high density. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-2 space-y-3">
      {/* SECTION 1 · Lead Identity */}
      <Card className="overflow-hidden">
        <div
          className="h-[2px] w-full"
          style={{
            background:
              "linear-gradient(90deg, hsla(14,100%,56%,0.6), hsla(48,91%,53%,0.4), hsla(14,100%,56%,0.6))",
          }}
        />
        <CardHeader className="p-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">
                <button
                  onClick={onOpenLeadDetails}
                  className="hover:underline focus:outline-none text-left w-full truncate"
                  title={session.customerName}
                >
                  {session.customerName}
                </button>
              </CardTitle>
              {session.crmData.position && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{session.crmData.position}</span>
                </p>
              )}
              {session.crmData.company && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                  <Building className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{session.crmData.company}</span>
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 text-emerald-600 hover:text-emerald-700 border-emerald-200/60 hover:bg-emerald-50 dark:border-emerald-500/30 dark:hover:bg-emerald-500/10"
              title="Abrir conversa no WhatsApp"
              onClick={() => {
                const phone = session.customerPhone.replace(/\D/g, "");
                const phoneWithCountry = phone.startsWith("55") ? phone : `55${phone}`;
                window.open(`https://wa.me/${phoneWithCountry}`, "_blank");
              }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-1.5">
          <div className="space-y-1">
            {session.crmData.email && (
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{session.crmData.email}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => copyToClipboard(session.crmData.email!, "Email")}
                  title="Copiar email"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-mono">{session.customerPhone}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => copyToClipboard(session.customerPhone, "Telefone")}
                title="Copiar telefone"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {session.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  {tag}
                  <button className="ml-1 hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTIONS 2 + 3 + 4 · Active Opportunities / Opportunity Detail */}
      {session.leadId && <LeadOpportunitiesSection leadId={session.leadId} />}

      {/* SECTION 5 · AI Commercial Copilot (skeleton) */}
      <Card className="bg-muted/30 border-dashed">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Copiloto Comercial
            <Badge variant="outline" className="text-[10px] ml-auto flex items-center gap-1 px-1.5 py-0 h-4">
              <Lock className="h-2.5 w-2.5" /> Em breve
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Sugestões de próximas ações, resumo da conversa e coaching em tempo
            real vão aparecer aqui.
          </p>
        </CardContent>
      </Card>
      </div>

      {/* Notes / Tasks / History tabs — independent scroll region. */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-shrink-0 flex flex-col border-t border-border/60 max-h-[45%] min-h-[260px]"
      >
        <TabsList className="mx-2 mt-2 w-auto">
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

        <TabsContent
          value="notes"
          className="flex-1 h-full min-h-0 overflow-y-auto p-2 m-0 flex flex-col"
        >
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione anotações sobre este lead..."
            className="flex-1 min-h-[120px] resize-none"
          />
          <Button
            size="sm"
            className="mt-2 shrink-0 bg-gradient-to-r from-solo-orange to-solo-yellow hover:from-solo-orange/90 hover:to-solo-yellow/90 text-white border-0 shadow-md"
            onClick={handleNotesBlur}
            disabled={notes === session.crmData.notes}
          >
            Salvar Notas
          </Button>
        </TabsContent>

        <TabsContent
          value="tasks"
          className="flex-1 h-full min-h-0 overflow-y-auto p-2 m-0"
        >
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Nova tarefa..."
                className="h-9"
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
              />
              <Button
                size="sm"
                onClick={handleAddTask}
                disabled={!newTask.trim()}
                className="bg-gradient-to-r from-solo-orange to-solo-yellow hover:from-solo-orange/90 hover:to-solo-yellow/90 text-white border-0 shadow-sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

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

        <TabsContent
          value="touchpoints"
          className="flex-1 h-full min-h-0 overflow-y-auto p-2 m-0"
        >
          {session?.leadId && <TouchpointsList leadId={session.leadId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
