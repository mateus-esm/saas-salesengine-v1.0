import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Task } from "@/hooks/useTasks";

/**
 * Sprint 5.3 T5 — subtasks for a single parent task.
 *
 * Subtasks are ordinary rows in `tasks` with `parent_task_id` set, so they
 * inherit the same status model and RLS. Decoupled from the lead-scoped
 * useTasks so any surface editing a task (TasksView, modals) can manage its
 * children with just the parent id.
 */
export const useSubtasks = (parentTaskId: string | null, leadId?: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["subtasks", parentTaskId];

  const query = useQuery({
    queryKey: key,
    enabled: !!parentTaskId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("parent_task_id", parentTaskId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as Task[]) || [];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createSubtask = useMutation({
    mutationFn: async (title: string) => {
      if (!parentTaskId) throw new Error("No parent task");
      // Subtasks belong to the same lead as their parent; resolve it if the
      // caller did not pass one.
      let resolvedLeadId = leadId ?? null;
      if (!resolvedLeadId) {
        const { data: parent } = await supabase
          .from("tasks")
          .select("lead_id")
          .eq("id", parentTaskId)
          .maybeSingle();
        resolvedLeadId = (parent as { lead_id?: string } | null)?.lead_id ?? null;
      }
      if (!resolvedLeadId) throw new Error("Could not resolve parent lead");

      const { error } = await supabase.from("tasks").insert({
        lead_id: resolvedLeadId,
        parent_task_id: parentTaskId,
        title: title.trim(),
        status: "a_fazer",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro ao criar subtarefa: " + e.message),
  });

  const toggleSubtask = useMutation({
    mutationFn: async (subtask: Task) => {
      const status = subtask.status === "feito" ? "a_fazer" : "feito";
      const { error } = await supabase.from("tasks").update({ status }).eq("id", subtask.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro ao atualizar subtarefa: " + e.message),
  });

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro ao remover subtarefa: " + e.message),
  });

  return {
    subtasks: query.data ?? [],
    isLoading: query.isLoading,
    createSubtask,
    toggleSubtask,
    deleteSubtask,
    refetch: query.refetch,
  };
};
