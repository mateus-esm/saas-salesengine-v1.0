import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ModelBreakdown } from "@/types/agent";
import { Cpu } from "lucide-react";

interface UsageModelBreakdownProps {
  models: ModelBreakdown[];
}

export function UsageModelBreakdown({ models }: UsageModelBreakdownProps) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          Consumo por Modelo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {models.map((model) => (
          <div key={model.model} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: model.color }}
                />
                <span className="text-sm font-medium">{model.model}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {model.credits.toLocaleString('pt-BR')} créditos
                </span>
                <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-full min-w-[48px] text-center">
                  {model.percentage}%
                </span>
              </div>
            </div>
            <Progress 
              value={model.percentage} 
              className="h-2"
              style={{ 
                '--progress-foreground': model.color 
              } as React.CSSProperties}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
