import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Plus, Search, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Task } from "@/hooks/useTasks";
import { useSubtasks } from "@/hooks/useSubtasks";
import { useTeamMembers } from "@/hooks/useTeamMembers";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: TaskFormData) => Promise<void>;
  task?: Task | null;
  mode: "create" | "edit";
  /** Sprint 5.3 T4 — show a lead selector when creating from the TasksView (no lead context). */
  showLeadSelector?: boolean;
  selectedLeadId?: string | null;
  onLeadChange?: (leadId: string | null) => void;
}

export interface TaskFormData {
  title: string;
  description: string;
  due_date: string | null;
  status: string;
  assigned_to: string | null;
}

const STATUS_OPTIONS = [
  { value: "a_fazer", label: "A Fazer" },
  { value: "fazendo", label: "Fazendo" },
  { value: "feito", label: "Feito" },
  { value: "parado", label: "Parado" },
];

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Sprint 5.3 T4 — Reusable create/edit task dialog used across all CRM surfaces. */
export function TaskDialog({ open, onOpenChange, onSave, task, mode, showLeadSelector, selectedLeadId, onLeadChange }: TaskDialogProps) {
  const { teamMembers } = useTeamMembers();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("a_fazer");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens / task changes
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title ?? "");
      setDescription(task.description ?? "");
      setStatus(task.status ?? "a_fazer");
      setAssignedTo(task.assigned_to ?? null);
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
    } else {
      setTitle("");
      setDescription("");
      setStatus("a_fazer");
      setAssignedTo(null);
      setDueDate(undefined);
    }
  }, [open, task]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        due_date: dueDate ? toLocalDateString(dueDate) : null,
        status,
        assigned_to: assignedTo,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova Tarefa" : "Editar Tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descreva a tarefa..."
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Descrição</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais..."
              rows={3}
            />
          </div>

          {/* Status + Deadline row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Deadline */}
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !dueDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Responsible */}
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select
              value={assignedTo ?? "__none__"}
              onValueChange={(v) => setAssignedTo(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecionar responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome_completo || m.email || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sprint 5.3 T5 — subtasks (only meaningful for an existing task) */}
          {mode === "edit" && task?.id && (
            <SubtaskSection parentTaskId={task.id} leadId={task.lead_id} />
          )}

          {/* Sprint 5.3 T4 — lead selector (shown when creating from TasksView) */}
          {showLeadSelector && (
            <LeadSearchSelect
              value={selectedLeadId ?? null}
              onChange={(id) => onLeadChange?.(id)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Criar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sprint 5.3 T5 — subtask checklist for an existing task. */
function SubtaskSection({
  parentTaskId,
  leadId,
}: {
  parentTaskId: string;
  leadId: string;
}) {
  const { subtasks, createSubtask, toggleSubtask, deleteSubtask } = useSubtasks(
    parentTaskId,
    leadId,
  );
  const [newTitle, setNewTitle] = useState("");

  const add = () => {
    if (!newTitle.trim()) return;
    createSubtask.mutate(newTitle.trim());
    setNewTitle("");
  };

  const doneCount = subtasks.filter((s) => s.status === "feito").length;

  return (
    <div className="space-y-1.5">
      <Label>
        Subtarefas
        {subtasks.length > 0 && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {doneCount}/{subtasks.length}
          </span>
        )}
      </Label>

      {subtasks.length > 0 && (
        <div className="space-y-1">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 group">
              <Checkbox
                checked={s.status === "feito"}
                onCheckedChange={() => toggleSubtask.mutate(s)}
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  s.status === "feito" && "line-through text-muted-foreground",
                )}
              >
                {s.title}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                onClick={() => deleteSubtask.mutate(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nova subtarefa..."
          className="h-8"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0"
          onClick={add}
          disabled={!newTitle.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Sprint 5.3 T4 — quick lead search/select for the create-task-from-TasksView flow. */
function LeadSearchSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("leads")
      .select("id, name, phone")
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
      .is("deleted_at", null)
      .limit(10)
      .then(({ data }) => {
        if (!cancelled) {
          setResults((data ?? []) as { id: string; name: string; phone: string | null }[]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <div className="space-y-1.5">
      <Label>Contato</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Buscar contato por nome ou telefone..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && query.length >= 2 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-auto">
            {loading ? (
              <div className="p-2 text-xs text-muted-foreground text-center">
                <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                Buscando...
              </div>
            ) : results.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground text-center">Nenhum contato encontrado</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${value === r.id ? "bg-accent font-medium" : ""}`}
                  onClick={() => { onChange(r.id); setQuery(r.name); setOpen(false); }}
                >
                  <span className="font-medium">{r.name}</span>
                  {r.phone && <span className="ml-2 text-muted-foreground">{r.phone}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
