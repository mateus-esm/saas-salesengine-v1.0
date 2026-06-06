import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
  done: "Concluída",
};

/**
 * Sprint 5.2 T13 — Master Task Ledger.
 * High-density matrix of every task across all pipelines: header, deadline,
 * status and owner. Reads useAllTasks (tenant-wide) + useTeamMembers (owners).
 */
const Tasks = () => {
  const { data: tasks = [], isLoading } = useAllTasks();
  const { teamMembers } = useTeamMembers();

  const ownerById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((m) => map.set(m.id, m.nome_completo || m.email || "—"));
    return map;
  }, [teamMembers]);

  const isOverdue = (due: string | null, status: string) =>
    !!due && new Date(due) < new Date() && status !== "feito";

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-primary" />
          Tarefas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todas as tarefas operacionais, prazos e responsáveis — em todos os funis.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">Nenhuma tarefa cadastrada.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Tarefa</th>
                  <th className="text-left font-medium px-4 py-2.5">Contato</th>
                  <th className="text-left font-medium px-4 py-2.5">Prazo</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((t) => {
                  const overdue = isOverdue(t.due_date, t.status);
                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{t.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{t.leadName ?? "—"}</td>
                      <td
                        className={cn(
                          "px-4 py-2.5",
                          overdue ? "text-destructive font-medium" : "text-muted-foreground",
                        )}
                      >
                        {t.due_date ? format(new Date(t.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {t.assigned_to ? ownerById.get(t.assigned_to) ?? "—" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tasks;
