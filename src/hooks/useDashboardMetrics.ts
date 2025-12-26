import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format } from "date-fns";

export interface DashboardMetrics {
  totalLeads: number;
  leadsByStage: { stage_id: string; stage_name: string; count: number; color: string }[];
  meetingsScheduled: number;
  meetingsDone: number;
  noShowCount: number;
  meetingsToday: number;
  totalPipelineValue: number;
  conversionRate: number;
  noShowRate: number;
  leadsByResponsible: { responsible_id: string; responsible_name: string; count: number }[];
  leadsOverTime: { date: string; count: number }[];
}

interface UseDashboardMetricsOptions {
  startDate: Date;
  endDate: Date;
}

export const useDashboardMetrics = ({ startDate, endDate }: UseDashboardMetricsOptions) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["dashboard_metrics", equipeId, startDate.toISOString(), endDate.toISOString()],
    queryFn: async (): Promise<DashboardMetrics> => {
      if (!equipeId) {
        throw new Error("No team assigned");
      }

      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Fetch leads in date range
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, stage_id, opportunity_value, meeting_scheduled, meeting_done, no_show, meeting_date, responsible_id, created_at")
        .eq("equipe_id", equipeId)
        .gte("created_at", startStr)
        .lte("created_at", endStr);

      if (leadsError) throw leadsError;

      // Fetch pipeline stages
      const { data: stages, error: stagesError } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, position")
        .eq("equipe_id", equipeId)
        .order("position");

      if (stagesError) throw stagesError;

      // Fetch team members for responsible names
      const { data: teamMembers, error: teamError } = await supabase
        .from("profiles")
        .select("id, nome_completo")
        .eq("equipe_id", equipeId);

      if (teamError) throw teamError;

      // Calculate metrics
      const totalLeads = leads?.length || 0;
      
      // Leads by stage
      const stageCountMap = new Map<string, number>();
      leads?.forEach(lead => {
        if (lead.stage_id) {
          stageCountMap.set(lead.stage_id, (stageCountMap.get(lead.stage_id) || 0) + 1);
        }
      });

      const leadsByStage = (stages || []).map(stage => ({
        stage_id: stage.id,
        stage_name: stage.name,
        count: stageCountMap.get(stage.id) || 0,
        color: stage.color,
      }));

      // Meeting metrics
      const meetingsScheduled = leads?.filter(l => l.meeting_scheduled).length || 0;
      const meetingsDone = leads?.filter(l => l.meeting_done).length || 0;
      const noShowCount = leads?.filter(l => l.no_show).length || 0;

      // Meetings today (based on meeting_date)
      const meetingsToday = leads?.filter(l => {
        if (!l.meeting_date) return false;
        const meetingDate = new Date(l.meeting_date);
        return meetingDate >= new Date(todayStart) && meetingDate <= new Date(todayEnd);
      }).length || 0;

      // Total pipeline value
      const totalPipelineValue = leads?.reduce((sum, l) => sum + (Number(l.opportunity_value) || 0), 0) || 0;

      // Conversion rate (meetings scheduled / total leads)
      const conversionRate = totalLeads > 0 ? (meetingsScheduled / totalLeads) * 100 : 0;

      // No-show rate (no-shows / meetings scheduled)
      const noShowRate = meetingsScheduled > 0 ? (noShowCount / meetingsScheduled) * 100 : 0;

      // Leads by responsible
      const responsibleCountMap = new Map<string, number>();
      leads?.forEach(lead => {
        if (lead.responsible_id) {
          responsibleCountMap.set(lead.responsible_id, (responsibleCountMap.get(lead.responsible_id) || 0) + 1);
        }
      });

      const leadsByResponsible = Array.from(responsibleCountMap.entries()).map(([id, count]) => {
        const member = teamMembers?.find(m => m.id === id);
        return {
          responsible_id: id,
          responsible_name: member?.nome_completo || "Não atribuído",
          count,
        };
      }).sort((a, b) => b.count - a.count);

      // Leads over time (daily counts)
      const dateCountMap = new Map<string, number>();
      leads?.forEach(lead => {
        const dateKey = format(new Date(lead.created_at), "yyyy-MM-dd");
        dateCountMap.set(dateKey, (dateCountMap.get(dateKey) || 0) + 1);
      });

      const leadsOverTime = Array.from(dateCountMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalLeads,
        leadsByStage,
        meetingsScheduled,
        meetingsDone,
        noShowCount,
        meetingsToday,
        totalPipelineValue,
        conversionRate,
        noShowRate,
        leadsByResponsible,
        leadsOverTime,
      };
    },
    enabled: !!equipeId,
  });
};
