import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SLAIndicatorProps {
  stageEnteredAt: string | null;
  compact?: boolean;
}

export function SLAIndicator({ stageEnteredAt, compact = false }: SLAIndicatorProps) {
  if (!stageEnteredAt) return null;

  const enteredDate = new Date(stageEnteredAt);
  const daysInStage = differenceInDays(new Date(), enteredDate);
  
  // Color logic: green < 3 days, yellow 3-7 days, red > 7 days
  let colorClass = "bg-green-500/10 text-green-600 border-green-500/30";
  if (daysInStage >= 7) {
    colorClass = "bg-red-500/10 text-red-600 border-red-500/30";
  } else if (daysInStage >= 3) {
    colorClass = "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
  }

  const timeText = formatDistanceToNow(enteredDate, { locale: ptBR });

  if (compact) {
    return (
      <Badge variant="outline" className={`text-xs ${colorClass}`}>
        <Clock className="h-3 w-3 mr-1" />
        {daysInStage}d
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`text-xs ${colorClass}`}>
      <Clock className="h-3 w-3 mr-1" />
      {timeText} nesta etapa
    </Badge>
  );
}
