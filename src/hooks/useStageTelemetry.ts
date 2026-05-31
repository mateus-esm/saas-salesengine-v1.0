import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StageTelemetry {
  /** Hours since the opportunity entered its current stage. */
  hoursInPhase: number;
  /** true when hoursInPhase >= stage.max_idle_hours and the stage has a threshold set. */
  slaBreached: boolean;
  /** Human-readable label, e.g. "3d 4h" or "2h" or "45min". */
  hoursInPhaseLabel: string;
  /** Total touchpoints associated to the lead. */
  touchpointCount: number;
  /** "Hoje 14:00" | "Amanhã" | "Atrasado" | null. */
  nextContactLabel: string | null;
  /** true when next_contact is in the past. */
  nextContactOverdue: boolean;
}

interface TelemetryInputs {
  stageEnteredAt: string;
  maxIdleHours: number | null;
  touchpointCount: number;
  nextContact: string | null;
}

const formatDuration = (hours: number): string => {
  if (!Number.isFinite(hours) || hours <= 0) return "1min";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}min`;
  if (hours < 24) return `${Math.round(hours)}h`;

  const days = Math.floor(hours / 24);
  const rem = Math.round(hours - days * 24);
  return rem ? `${days}d ${rem}h` : `${days}d`;
};

const formatNextContact = (iso: string | null): { label: string | null; overdue: boolean } => {
  if (!iso) return { label: null, overdue: false };

  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return { label: null, overdue: false };

  const now = new Date();
  const ms = target.getTime() - now.getTime();
  if (ms < 0) return { label: "Atrasado", overdue: true };

  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  if (sameDay) {
    const hh = String(target.getHours()).padStart(2, "0");
    const mm = String(target.getMinutes()).padStart(2, "0");
    return { label: `Hoje ${hh}:${mm}`, overdue: false };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();

  if (isTomorrow) return { label: "Amanhã", overdue: false };

  return { label: target.toLocaleDateString("pt-BR"), overdue: false };
};

/**
 * Sprint 5.1 section 3.1 - batched touchpoint counts for an array of lead ids.
 * Returns a map { [lead_id]: count }. Empty arrays short-circuit without
 * hitting the network.
 */
export const useTouchpointCounts = (leadIds: string[]): Record<string, number> => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const uniqueLeadIds = useMemo(
    () => Array.from(new Set(leadIds.filter(Boolean))).sort(),
    [leadIds],
  );
  const sortedKey = uniqueLeadIds.join(",");

  const { data } = useQuery({
    queryKey: ["touchpoint-counts", equipeId, sortedKey],
    enabled: !!equipeId && uniqueLeadIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("touchpoints")
        .select("lead_id")
        .in("lead_id", uniqueLeadIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.lead_id] = (counts[row.lead_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  return data ?? {};
};

/**
 * Pure computation - kept separate from the data hook so cards and tables that
 * already have the inputs can render telemetry without extra queries.
 */
export const computeStageTelemetry = (input: TelemetryInputs): StageTelemetry => {
  const enteredMs = new Date(input.stageEnteredAt).getTime();
  const hoursInPhase = Number.isFinite(enteredMs)
    ? Math.max(0, (Date.now() - enteredMs) / 36e5)
    : 0;
  const slaBreached =
    typeof input.maxIdleHours === "number" &&
    input.maxIdleHours > 0 &&
    hoursInPhase >= input.maxIdleHours;
  const { label: nextContactLabel, overdue: nextContactOverdue } = formatNextContact(input.nextContact);

  return {
    hoursInPhase,
    slaBreached,
    hoursInPhaseLabel: formatDuration(hoursInPhase),
    touchpointCount: input.touchpointCount,
    nextContactLabel,
    nextContactOverdue,
  };
};
