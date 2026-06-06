import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Task {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  parent_task_id: string | null;
  created_at: string;
  created_by: string | null;
}

type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'due_date' | 'status' | 'assigned_to'>
>;

/**
 * Sprint 5.3 T4 — lead-scoped task hook, rewritten onto TanStack Query so it is
 * uniform with every other data hook (the old raw-useState version was the last
 * holdout). Returns only top-level tasks for the lead; subtasks are handled by
 * useSubtasks. Realtime postgres_changes simply invalidate the cached query.
 */
export function useTasks(leadId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['tasks', leadId];

  const tasksQuery = useQuery({
    queryKey: key,
    enabled: !!leadId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('lead_id', leadId as string)
        .is('parent_task_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Task[]) || [];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createTaskMut = useMutation({
    mutationFn: async ({
      title,
      description,
      dueDate,
    }: {
      title: string;
      description?: string;
      dueDate?: string;
    }) => {
      if (!leadId) throw new Error('No lead_id');
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          lead_id: leadId,
          title: title.trim(),
          description: description ?? null,
          due_date: dueDate ?? null,
          created_by: user?.id ?? null,
          status: 'a_fazer',
        })
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Tarefa criada');
    },
    onError: (e: Error) => toast.error('Erro ao criar tarefa: ' + e.message),
  });

  const updateTaskMut = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: TaskPatch }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Tarefa atualizada');
    },
    onError: (e: Error) => toast.error('Erro ao atualizar tarefa: ' + e.message),
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Tarefa removida');
    },
    onError: (e: Error) => toast.error('Erro ao remover tarefa: ' + e.message),
  });

  // Realtime — any task change for this lead refreshes the cache.
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`tasks-${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `lead_id=eq.${leadId}` },
        () => invalidate(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // ── Public API (stable shape; consumers unchanged from the useState era) ──
  const createTask = (title: string, description?: string, dueDate?: string) => {
    if (!leadId || !title.trim()) return Promise.resolve(null);
    return createTaskMut.mutateAsync({ title, description, dueDate });
  };

  const updateTask = (taskId: string, patch: TaskPatch) =>
    updateTaskMut.mutateAsync({ taskId, patch });

  const toggleTask = (taskId: string) => {
    const task = (tasksQuery.data ?? []).find((t) => t.id === taskId);
    if (!task) return Promise.resolve();
    const status = task.status === 'feito' ? 'a_fazer' : 'feito';
    return updateTaskMut.mutateAsync({ taskId, patch: { status } });
  };

  const assignTask = (taskId: string, profileId: string | null) =>
    updateTaskMut.mutateAsync({ taskId, patch: { assigned_to: profileId } });

  const deleteTask = (taskId: string) => deleteTaskMut.mutateAsync(taskId);

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    createTask,
    updateTask,
    toggleTask,
    assignTask,
    deleteTask,
    refetch: tasksQuery.refetch,
  };
}
