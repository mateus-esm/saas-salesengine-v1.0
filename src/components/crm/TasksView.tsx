import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Edit3, Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { TaskDialog, TaskFormData } from "@/components/crm/TaskDialog";
import { ColumnVisibilityDropdown } from "@/components/crm/ColumnVisibilityDropdown";
import { toast } from "sonner";

// Sprint 5.3 T10 — toggleable columns (Tarefa + row actions always shown).
const TASK_COLUMNS: { id: string; label: string }[] = [
  { id: "lead", label: "Contato" },
  { id: "due_date", label: "Prazo" },
  { id: "status", label: "Status" },
  { id: "assigned_to", label: "Responsável" },
];

const STATUS_LABEL: Record<string, string> = {
  a_fazer: "A Fazer",
  fazendo: "Fazendo",
  feito: "Feito",
  parado: "Parado",
};

const STATUS_COLOR: Record<string, string> = {
  a_fazer: "bg-slate-100 text-slate-700 border-slate-200",
  fazendo: "bg-amber-50 text-amber-700 border-amber-200",
  feito: "bg-emerald-50 text-emerald-700 border-emerald-200",
  parado: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * Sprint 5.3 T1 — Extracted from the old Tasks page so it can be rendered
 * inside CRM. Sprint 5.3 T3 — updated status labels. Sprint 5.3 T4 — added
 * create/edit/delete via TaskDialog and inline status selector.
 */
const TasksView = () => {
  const { data: tasks = [], isLoading } = useAllTasks();
  const { teamMembers } = useTeamMembers();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<{
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string;
    assigned_to: string | null;
    lead_id: string;
    leadName: string | null;
  } | null>(null);
  const [createLeadId, setCreateLeadId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const isVisible = (id: string) => !hidden[id];

  const ownerById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((m) => map.set(m.id, m.nome_completo || m.email || "—"));
    return map;
  }, [teamMembers]);

  const isOverdue = (due: string | null, status: string) =>
    !!due && new Date(due) < new Date() && status !== "feito";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["all_tasks"] });

  const handleSave = async (data: TaskFormData) => {
    if (editTask) {
      // Update existing task
      const { error } = await supabase
        .from("tasks")
        .update({
          title: data.title,
          description: data.description || null,
          due_date: data.due_date,
          status: data.status,
          assigned_to: data.assigned_to,
        })
        .eq("id", editTask.id);
      if (error) throw error;
      toast.success("Tarefa atualizada");
    }
    invalidate();
  };

  /** Sprint 5.3 T4 — create a task via the CRM tasks tab. The user must
   *  select a lead via the lead selector in the TaskDialog. */
  const handleCreate = async (data: TaskFormData) => {
    if (!createLeadId) {
      toast.error("Selecione um contato para vincular a tarefa");
      return;
    }
    const { error } = await supabase.from("tasks").insert({
      title: data.title,
      description: data.description || null,
      due_date: data.due_date,
      status: data.status,
      assigned_to: data.assigned_to,
      lead_id: createLeadId,
      created_by: profile?.id,
    });
    if (error) {
      toast.error("Erro ao criar tarefa");
      return;
    }
    toast.success("Tarefa criada");
    setCreateLeadId(null);
    invalidate();
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);
    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    toast.success("Status atualizado");
    invalidate();
  };

  const handleDelete = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId);
    if (error) {
      toast.error("Erro ao remover tarefa");
      return;
    }
    toast.success("Tarefa removida");
    invalidate();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <h3 className="text-sm font-medium text-muted-foreground">
          {tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}
        </h3>
        <div className="flex items-center gap-2">
          <ColumnVisibilityDropdown
            columns={TASK_COLUMNS.map((c) => ({ ...c, visible: isVisible(c.id) }))}
            onToggle={(id, visible) =>
              setHidden((prev) => ({ ...prev, [id]: !visible }))
            }
          />
          <Button
            size="sm"
            onClick={() => {
              setEditTask(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">Nenhuma tarefa cadastrada.</p>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Tarefa</th>
                  {isVisible("lead") && <th className="text-left font-medium px-4 py-2.5">Contato</th>}
                  {isVisible("due_date") && <th className="text-left font-medium px-4 py-2.5">Prazo</th>}
                  {isVisible("status") && <th className="text-left font-medium px-4 py-2.5">Status</th>}
                  {isVisible("assigned_to") && <th className="text-left font-medium px-4 py-2.5">Responsável</th>}
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((t) => {
                  const overdue = isOverdue(t.due_date, t.status);
                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors group">
                      <td
                        className="px-4 py-2.5 font-medium text-foreground cursor-pointer hover:text-primary"
                        onClick={() => {
                          setEditTask(t);
                          setDialogOpen(true);
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{t.title}</span>
                          <Edit3 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </td>
                      {isVisible("lead") && (
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {t.leadName ?? "—"}
                        </td>
                      )}
                      {isVisible("due_date") && (
                        <td
                          className={cn(
                            "px-4 py-2.5",
                            overdue ? "text-destructive font-medium" : "text-muted-foreground",
                          )}
                        >
                          {t.due_date ? format(new Date(t.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                        </td>
                      )}
                      {isVisible("status") && (
                        <td className="px-4 py-2.5">
                          <Select
                            value={t.status}
                            onValueChange={(v) => handleStatusChange(t.id, v)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-7 text-xs border-transparent hover:border-border",
                                STATUS_COLOR[t.status] ?? "",
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABEL).map(([val, lbl]) => (
                                <SelectItem key={val} value={val}>
                                  {lbl}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isVisible("assigned_to") && (
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {t.assigned_to ? ownerById.get(t.assigned_to) ?? "—" : "—"}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task Dialog — opened as edit mode when a row is clicked, create mode otherwise */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            setEditTask(null);
            setCreateLeadId(null);
          }
        }}
        onSave={editTask ? handleSave : handleCreate}
        task={
          editTask
            ? {
                id: editTask.id,
                lead_id: editTask.lead_id,
                title: editTask.title,
                description: editTask.description,
                due_date: editTask.due_date,
                status: editTask.status,
                assigned_to: editTask.assigned_to,
                parent_task_id: null,
                created_at: "",
                created_by: null,
              }
            : null
        }
        mode={editTask ? "edit" : "create"}
        showLeadSelector={!editTask}
        selectedLeadId={createLeadId}
        onLeadChange={setCreateLeadId}
      />
    </div>
  );
};

export default TasksView;
