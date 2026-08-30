/**
 * Sprint 9 — a chart over one of the client's OWN fields.
 *
 * The field picker is fed by get_custom_field_options(), which returns only
 * fields the tenant declared in their pipeline schema. That is the same list
 * the RPC validates against, so the UI physically cannot offer a key the
 * backend would refuse — the whitelist is not duplicated here, it is read from
 * the one place that owns it.
 *
 * The chosen field is remembered per browser rather than in the layout: it is a
 * reading preference, not a team decision, and putting it in the shared layout
 * would mean one person changing the field changes it for everyone.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { seriesColor } from "@/config/chartTheme";
import type { DashboardFilters } from "@/types/dashboard";
import {
  AXIS_TICK,
  ChartCard,
  ChartTooltip,
  EmptyChart,
  GRID_PROPS,
  formatBRL,
  formatBRLCompact,
  formatInt,
  useChartTheme,
} from "./chart-primitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface FieldOption {
  pipeline_id: string;
  pipeline_name: string;
  key: string;
  label: string;
  type: string;
  groupable: boolean;
  summable: boolean;
}

interface Row {
  label: string;
  value: number;
  count: number;
}

const STORAGE_KEY = "sprint9.customFieldWidget.field";

export function useCustomFieldOptions() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["custom_field_options", profile?.equipe_id],
    enabled: !!profile?.equipe_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FieldOption[]> => {
      const { data, error } = await sb.rpc("get_custom_field_options");
      if (error) throw error;
      return (data ?? []) as FieldOption[];
    },
  });
}

export function CustomFieldWidget({ filters }: { filters: DashboardFilters }) {
  const theme = useChartTheme();
  const { profile } = useAuth();
  const { data: options } = useCustomFieldOptions();
  const [fieldKey, setFieldKey] = useState<string>("");

  // localStorage can throw outright in a private window or with site data
  // blocked, so both directions are guarded and the widget still renders.
  useEffect(() => {
    if (fieldKey || !options?.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const valid = saved && options.some((o) => o.key === saved) ? saved : options[0].key;
    setFieldKey(valid);
  }, [options, fieldKey]);

  const selected = options?.find((o) => o.key === fieldKey);

  const { data: rows } = useQuery({
    queryKey: [
      "custom_field_breakdown",
      profile?.equipe_id,
      fieldKey,
      filters.from.toISOString(),
      filters.to.toISOString(),
    ],
    enabled: !!profile?.equipe_id && !!fieldKey,
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await sb.rpc("get_custom_field_breakdown", {
        p_field_key: fieldKey,
        p_from: filters.from.toISOString(),
        p_to: filters.to.toISOString(),
        // Revenue by the client's own field is the question they actually ask.
        p_agg: "value",
        p_pipeline_ids: filters.pipelineIds?.length ? filters.pipelineIds : null,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (!options?.length) {
    return (
      <ChartCard
        title="Seus campos personalizados"
        description="Gráficos sobre os campos que você criou no pipeline."
      >
        <EmptyChart message="Nenhum campo personalizado do tipo texto, seleção ou valor foi criado neste pipeline ainda." />
      </ChartCard>
    );
  }

  const picker = (
    <Select
      value={fieldKey}
      onValueChange={(v) => {
        setFieldKey(v);
        try {
          localStorage.setItem(STORAGE_KEY, v);
        } catch {
          /* ignore */
        }
      }}
    >
      <SelectTrigger className="h-7 w-[180px] text-xs">
        <SelectValue placeholder="Escolha um campo" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={`${o.pipeline_id}:${o.key}`} value={o.key} className="text-xs">
            {o.label}
            <span className="ml-1.5 text-muted-foreground">· {o.pipeline_name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <ChartCard
      title={selected ? `Receita por ${selected.label}` : "Seus campos personalizados"}
      description="Um campo que você criou, somando o valor das oportunidades."
      action={picker}
    >
      {rows && rows.length > 0 ? (
        <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatBRLCompact}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
              content={<ChartTooltip valueFormatter={formatBRL} />}
            />
            <Bar
              dataKey="value"
              name="Receita"
              radius={[0, 4, 4, 0]}
              barSize={18}
              isAnimationActive={false}
            >
              {rows.map((r, i) => (
                <Cell key={r.label} fill={seriesColor(i, theme)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart message="Nenhuma oportunidade com esse campo preenchido no período." />
      )}

      {rows && rows.length > 0 && (
        <div className="mt-3 grid gap-1 text-[11px]">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 px-1">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium text-foreground">{formatBRL(r.value)}</span>
                <span className="ml-2 text-muted-foreground">{formatInt(r.count)} negócios</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
