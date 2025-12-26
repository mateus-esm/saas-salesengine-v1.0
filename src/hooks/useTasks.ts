import { useState, useEffect, useCallback } from 'react';
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
  created_at: string;
  created_by: string | null;
}

export function useTasks(leadId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  // Fetch tasks for a lead
  const fetchTasks = useCallback(async () => {
    if (!leadId) {
      setTasks([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks((data as Task[]) || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Erro ao carregar tarefas');
    } finally {
      setIsLoading(false);
    }
  }, [leadId]);

  // Create a new task
  const createTask = useCallback(async (title: string, description?: string, dueDate?: string) => {
    if (!leadId || !title.trim()) return null;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          lead_id: leadId,
          title: title.trim(),
          description,
          due_date: dueDate,
          created_by: user?.id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Tarefa criada');
      return data as Task;
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Erro ao criar tarefa');
      return null;
    }
  }, [leadId, user?.id]);

  // Toggle task status
  const toggleTask = useCallback(async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const newStatus = task.status === 'done' ? 'pending' : 'done';
      
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (error) throw error;
      
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, status: newStatus } : t
      ));
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error('Erro ao atualizar tarefa');
    }
  }, [tasks]);

  // Delete a task
  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Tarefa removida');
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Erro ao remover tarefa');
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Realtime subscription
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`tasks-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `lead_id=eq.${leadId}`
        },
        (payload) => {
          console.log('Task change:', payload);
          if (payload.eventType === 'INSERT') {
            setTasks(prev => [payload.new as Task, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks(prev => prev.map(t => 
              t.id === (payload.new as Task).id ? payload.new as Task : t
            ));
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  return {
    tasks,
    isLoading,
    createTask,
    toggleTask,
    deleteTask,
    refetch: fetchTasks
  };
}
