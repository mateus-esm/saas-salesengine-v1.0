/**
 * Sprint 9 — report schedules and their recipients.
 *
 * Phone numbers are normalised HERE, before they reach the database, because
 * the column CHECK only rejects obviously-wrong shapes. Sprint 8.5 lost a
 * sprint to numbers stored without the country code: the Solo API accepts them
 * and the message simply never arrives, with no error anywhere.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ReportFrequency = "daily" | "weekly" | "monthly";

export interface ReportSchedule {
  id: string;
  equipe_id: string;
  name: string;
  frequency: ReportFrequency;
  send_hour: number;
  weekday: number | null;
  monthday: number | null;
  timezone: string;
  sections: string[];
  filters: Record<string, unknown>;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface ReportRecipient {
  id: string;
  schedule_id: string;
  name: string | null;
  phone: string;
  active: boolean;
}

export interface ReportRun {
  id: string;
  schedule_id: string;
  period_start: string;
  period_end: string;
  status: string;
  recipients_n: number;
  error: string | null;
  public_token: string;
  created_at: string;
}

/**
 * Brazilian mobile numbers, to the shape the Solo API needs: digits, country
 * code included.
 *
 * Mirrors supabase/functions/_shared/phone.ts. Duplicated deliberately — the
 * browser cannot import a Deno module — and kept deliberately small: this only
 * has to catch what a human types into a form.
 */
export function normalizePhoneBR(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;

  // 55 + DDD (2) + assinante (9 celular | 8 fixo).
  const BR = /^55[1-9][0-9](9[0-9]{8}|[2-5][0-9]{7})$/;

  if (BR.test(digits)) return digits;

  // Local, sem DDI: DDD + assinante. Prefixa o 55 e revalida — nunca devolve
  // um palpite que não passe na mesma regra do banco.
  if (digits.length === 10 || digits.length === 11) {
    const withDDI = `55${digits}`;
    return BR.test(withDDI) ? withDDI : null;
  }

  // Tudo mais é recusado, inclusive o caso que motivou esta função: um número
  // brasileiro sem o 55 cujo comprimento por acaso parece ter DDI
  // (859999939862 = DDD 85 grudado no celular). A versão anterior aceitava
  // qualquer coisa entre 12 e 15 dígitos, o que fazia a mensagem ser "enviada"
  // para um país que não existe e desaparecer sem erro nenhum.
  return null;
}

export function useReportSchedules() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["report_schedules"] });
    qc.invalidateQueries({ queryKey: ["report_recipients"] });
  };

  const schedules = useQuery({
    queryKey: ["report_schedules", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<ReportSchedule[]> => {
      const { data, error } = await sb
        .from("report_schedules")
        .select("*")
        .eq("equipe_id", equipeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReportSchedule[];
    },
  });

  const recipients = useQuery({
    queryKey: ["report_recipients", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<ReportRecipient[]> => {
      const { data, error } = await sb.from("report_recipients").select("*").eq("active", true);
      if (error) throw error;
      return (data ?? []) as ReportRecipient[];
    },
  });

  const createSchedule = useMutation({
    mutationFn: async (input: Partial<ReportSchedule>) => {
      const { data, error } = await sb
        .from("report_schedules")
        .insert({ ...input, equipe_id: equipeId })
        .select()
        .single();
      if (error) throw error;
      return data as ReportSchedule;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Relatório agendado");
    },
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível criar o agendamento"),
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ReportSchedule> & { id: string }) => {
      const { error } = await sb.from("report_schedules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível salvar"),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Agendamento removido");
    },
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível remover"),
  });

  const addRecipient = useMutation({
    mutationFn: async ({ scheduleId, name, phone }: { scheduleId: string; name: string; phone: string }) => {
      const normalized = normalizePhoneBR(phone);
      if (!normalized) {
        throw new Error("Telefone inválido. Use DDD + número, ex.: (11) 99999-8888.");
      }
      const { error } = await sb
        .from("report_recipients")
        .insert({ schedule_id: scheduleId, name: name.trim() || null, phone: normalized });
      if (error) {
        // 23505 — the same number twice on one schedule.
        if ((error as { code?: string }).code === "23505") {
          throw new Error("Esse número já recebe este relatório.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Destinatário adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRecipient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("report_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível remover"),
  });

  return {
    schedules: schedules.data ?? [],
    recipients: recipients.data ?? [],
    isLoading: schedules.isLoading,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    addRecipient,
    removeRecipient,
  };
}

/** The last runs of a schedule — the delivery log the founder asked for. */
export function useReportRuns(scheduleId?: string) {
  return useQuery({
    queryKey: ["report_runs", scheduleId],
    enabled: !!scheduleId,
    queryFn: async (): Promise<ReportRun[]> => {
      const { data, error } = await sb
        .from("report_runs")
        .select("*")
        .eq("schedule_id", scheduleId)
        .order("period_start", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ReportRun[];
    },
  });
}
