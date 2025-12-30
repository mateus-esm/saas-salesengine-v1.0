import { Zap, Wallet, Target, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AgentUsageData } from "@/types/agent";

interface UsageCreditsCardsProps {
  data: AgentUsageData;
}

export function UsageCreditsCards({ data }: UsageCreditsCardsProps) {
  const usagePercentage = Math.round((data.creditsSpent / data.totalCredits) * 100);
  
  const cards = [
    {
      title: "Créditos Utilizados",
      value: data.creditsSpent.toLocaleString('pt-BR'),
      icon: Zap,
      gradient: "from-primary/10 to-primary/5",
      iconBg: "bg-primary/20",
      iconColor: "text-primary",
    },
    {
      title: "Disponíveis",
      value: data.creditsBalance.toLocaleString('pt-BR'),
      icon: Wallet,
      gradient: "from-emerald-500/10 to-emerald-500/5",
      iconBg: "bg-emerald-500/20",
      iconColor: "text-emerald-500",
    },
    {
      title: "Limite Total",
      value: data.totalCredits.toLocaleString('pt-BR'),
      icon: Target,
      gradient: "from-blue-500/10 to-blue-500/5",
      iconBg: "bg-blue-500/20",
      iconColor: "text-blue-500",
    },
    {
      title: "Taxa de Uso",
      value: `${usagePercentage}%`,
      icon: TrendingUp,
      gradient: "from-amber-500/10 to-amber-500/5",
      iconBg: "bg-amber-500/20",
      iconColor: "text-amber-500",
      showProgress: true,
      progress: usagePercentage,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card 
          key={card.title} 
          className={`bg-gradient-to-br ${card.gradient} border-border/50 hover:border-border transition-all duration-300 hover:shadow-lg`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
                <p className="text-2xl font-bold tracking-tight">{card.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </div>
            {card.showProgress && (
              <Progress value={card.progress} className="mt-3 h-1.5" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
