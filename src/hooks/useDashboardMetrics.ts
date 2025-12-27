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
  closedDealsCount: number;
  closedDealsValue: number;
  conversionRate: number;
  noShowRate: number;
  leadsByResponsible: { responsible_id: string; responsible_name: string; count: number }[];
  leadsOverTime: { date: string; count: number }[];
  // New KPIs from PRD v3.5
  closingRate: number; // Won leads / Total leads * 100
  avgTicket: number; // Average opportunity value of won deals
  avgSLADays: number; // Average days to close
  totalTouchpoints: number;
  avgTouchpointsPerLead: number;
  closingRatePostMeeting: number; // Won leads with meeting / Total meetings done * 100
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

      // Find the "won" category stage (Fechado)
      const wonStage = stages?.find(s => (s as any).category === 'won');

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

      // Total pipeline value (leads NOT in won stage)
      const totalPipelineValue = leads?.filter(l => !wonStage || l.stage_id !== wonStage.id)
        .reduce((sum, l) => sum + (Number(l.opportunity_value) || 0), 0) || 0;

      // Closed deals (leads in won stage)
      const closedDeals = leads?.filter(l => wonStage && l.stage_id === wonStage.id) || [];
      const closedDealsCount = closedDeals.length;
      const closedDealsValue = closedDeals.reduce((sum, l) => sum + (Number(l.opportunity_value) || 0), 0);

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

      // New KPIs: Calculate closing rate properly
      const closingRate = totalLeads > 0 ? (closedDealsCount / totalLeads) * 100 : 0;

      // Average ticket (won deals with value > 0)
      const dealsWithValue = closedDeals.filter(l => (Number(l.opportunity_value) || 0) > 0);
      const avgTicket = dealsWithValue.length > 0
        ? closedDealsValue / dealsWithValue.length
        : 0;

      // Closing rate post meeting
      const wonWithMeeting = closedDeals.filter(l => l.meeting_done).length;
      const closingRatePostMeeting = meetingsDone > 0
        ? (wonWithMeeting / meetingsDone) * 100
        : 0;

      // Fetch touchpoints for KPIs (using RPC if available, fallback to direct query)
      let totalTouchpoints = 0;
      try {
        // Try RPC function first
        const { data: kpiData, error: kpiError } = await supabase
          .rpc('get_dashboard_kpis', {
            p_equipe_id: equipeId,
            p_start_date: startStr,
            p_end_date: endStr
          });

        if (!kpiError && kpiData) {
          totalTouchpoints = kpiData.total_touchpoints || 0;
        }
      } catch {
        // RPC not available, fallback to direct count
        const { count } = await supabase
          .from('touchpoints')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startStr)
          .lte('created_at', endStr);
        totalTouchpoints = count || 0;
      }

      const avgTouchpointsPerLead = totalLeads > 0
        ? totalTouchpoints / totalLeads
        : 0;

      // Placeholder for SLA (would need more data)
      const avgSLADays = 0; // TODO: Implement when we have proper resolution dates

      return {
        totalLeads,
        leadsByStage,
        meetingsScheduled,
        meetingsDone,
        noShowCount,
        meetingsToday,
        totalPipelineValue,
        closedDealsCount,
        closedDealsValue,
        conversionRate,
        noShowRate,
        leadsByResponsible,
        leadsOverTime,
        // New KPIs
        closingRate,
        avgTicket,
        avgSLADays,
        totalTouchpoints,
        avgTouchpointsPerLead,
        closingRatePostMeeting,
      };
    },
    enabled: !!equipeId,
  });
};
