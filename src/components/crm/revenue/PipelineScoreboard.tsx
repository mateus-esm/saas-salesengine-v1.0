import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Target, Users, TrendingUp, BarChart3 } from "lucide-react";
import { useForecast } from "@/hooks/useForecast";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PipelineScoreboardProps {
  pipelineId: string;
}

export function PipelineScoreboard({ pipelineId }: PipelineScoreboardProps) {
  const storageKey = `scoreboard_open_${pipelineId}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== "false");
  const { data, isLoading } = useForecast(pipelineId);

  useEffect(() => {
    localStorage.setItem(storageKey, String(open));
  }, [open, storageKey]);

  if (isLoading) {
    return <div className="h-10 bg-black/5 animate-pulse rounded-md mx-4 mt-2" />;
  }

  if (!data) return null;

  const progressPct = data.placar.goal > 0
    ? Math.min(100, Math.round((data.placar.closed / data.placar.goal) * 100))
    : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors border-b border-border/40">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-3 w-3" />
            Placar de Receita
          </span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex items-stretch gap-0 border-b border-border/20 bg-card/50 px-4 py-2 text-xs font-mono overflow-x-auto">
          {/* Meta */}
          <div className="flex items-center gap-2 pr-4 border-r border-border/20 shrink-0">
            <Target className="h-3.5 w-3.5 text-emerald-500" />
            <div>
              <span className="text-muted-foreground">Meta</span>
              <span className="ml-2 font-semibold">{data.goal_deals}</span>
            </div>
          </div>

          {/* Inbound necessário */}
          <div className="flex items-center gap-2 px-4 border-r border-border/20 shrink-0">
            <Users className="h-3.5 w-3.5 text-blue-500" />
            <div>
              <span className="text-muted-foreground">Inbound</span>
              <span className="ml-2 font-semibold">{data.required_inbound}</span>
            </div>
          </div>

          {/* Placar */}
          <div className="flex items-center gap-2 px-4 border-r border-border/20 min-w-[160px] shrink-0">
            <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Fechados</span>
                <span>{data.placar.closed}/{data.placar.goal}</span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
            </div>
          </div>

          {/* Per-stage conversion chips */}
          {data.conversion_rates.slice(0, 5).map((r) => (
            <div key={r.stage_id} className="flex items-center gap-1 px-2 text-[10px] shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${r.source === "manual" ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span className="text-muted-foreground">{(r.rate * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
