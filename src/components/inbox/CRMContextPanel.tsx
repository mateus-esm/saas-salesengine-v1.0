import { useState, useEffect } from "react";
import { ChatSession, Task } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, Copy, Mail, Phone, Building, Briefcase, Plus, Trash2, X, MessageCircle, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";
import { TouchpointsList } from "@/components/crm/TouchpointsList";
import { LeadOpportunitiesSection } from "@/components/crm/LeadOpportunitiesSection";

interface CRMContextPanelProps {
  session: ChatSession | null;
  tasks: Task[];
  onUpdateCRM: (data: Partial<ChatSession["crmData"]>) => void;
  onAddTask: (title: string) => void;
  onToggleTask: (taskId: string) => void;
  /** Sprint 5.3 T4 — set an explicit status (a_fazer|fazendo|feito|parado). */
  onUpdateTaskStatus?: (taskId: string, status: string) => void;
  onDeleteTask?: (taskId: string) => void;
  stageEnteredAt?: string | null;
  onOpenLeadDetails?: () => void;
}

// Sprint 5.3 T3 — status labels + colors mirrored from TasksView.
const TASK_STATUS_LABEL: Record<string, string> = {
  a_fazer: "A Fazer",
  fazendo: "Fazendo",
  feito: "Feito",
  parado: "Parado",
};
const TASK_STATUS_COLOR: Record<string, string> = {
  a_fazer: "bg-slate-100 text-slate-700 border-slate-200",
  fazendo: "bg-amber-50 text-amber-700 border-amber-200",
  feito: "bg-emerald-50 text-emerald-700 border-emerald-200",
  parado: "bg-rose-50 text-rose-700 border-rose-200",
};

export function CRMContextPanel({
  session,
  tasks,
  onUpdateCRM,
  onAddTask,
  onToggleTask,
  onUpdateTaskStatus,
  onDeleteTask,
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

          {/* Sprint 5.3 T14 — Next contact badge in chat sidebar */}
          {(() => {
            const nc = session.crmData.next_contact;
            if (!nc) return null;
            const ncDate = new Date(nc);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffMs = ncDate.getTime() - today.getTime();
            const diffDays = Math.round(diffMs / 86_400_000);
            const stateClass =
              diffDays < 0
                ? "bg-destructive/15 text-destructive-foreground"
                : diffDays === 0
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : "bg-muted/50 text-muted-foreground";
            const label =
              diffDays < 0
                ? `Atrasado ${Math.abs(diffDays)}d`
                : diffDays === 0
                  ? "Hoje"
                  : diffDays === 1
                    ? "Amanhã"
                    : ncDate.toLocaleDateString("pt-BR");
            return (
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium ${stateClass}`}
                  title={`Próximo contato: ${ncDate.toLocaleDateString("pt-BR")}`}
                >
                  <CalendarIcon className="h-3 w-3 shrink-0" />
                  <span>{label}</span>
                </span>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* SECTIONS 2 + 3 + 4 · Active Opportunities / Opportunity Detail */}
      {session.leadId && <LeadOpportunitiesSection leadId={session.leadId} />}

      {/* T14 — legacy "Copiloto Comercial" skeleton removed to free reading
          real estate for customer records. */}
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

            {/* Sprint 5.3 T3/T4 — editable task rows: toggle done, change status,
                delete. The checkbox is a quick feito/a_fazer toggle; the status
                dropdown exposes the full four-state model. */}
            <div className="space-y-2 mt-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group"
                >
                  <Checkbox
                    checked={task.status === "feito"}
                    onCheckedChange={() => onToggleTask(task.id)}
                  />
                  <span
                    className={`text-sm flex-1 ${
                      task.status === "feito" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </span>
                  {onUpdateTaskStatus ? (
                    <Select
                      value={task.status}
                      onValueChange={(v) => onUpdateTaskStatus(task.id, v)}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-6 w-[88px] text-[11px] px-1.5 border-transparent",
                          TASK_STATUS_COLOR[task.status] ?? "",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TASK_STATUS_LABEL).map(([val, lbl]) => (
                          <SelectItem key={val} value={val}>
                            {lbl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={cn("text-[10px]", TASK_STATUS_COLOR[task.status] ?? "")}>
                      {TASK_STATUS_LABEL[task.status] ?? task.status}
                    </Badge>
                  )}
                  {onDeleteTask && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Excluir"
                      onClick={() => onDeleteTask(task.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
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
