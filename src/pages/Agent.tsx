import { useState } from "react";
import { Bot, RefreshCw, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentUsage } from "@/components/agent/AgentUsage";
import { AgentTraining } from "@/components/agent/AgentTraining";

export default function Agent() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Bot className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Agente IA</h1>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <Sparkles className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Gerencie o consumo e treinamento do seu agente
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 w-fit"
          onClick={() => setRefreshKey(k => k + 1)}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="usage" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="usage" className="gap-2 data-[state=active]:bg-background">
            <span className="text-lg">📊</span>
            Usage
          </TabsTrigger>
          <TabsTrigger value="training" className="gap-2 data-[state=active]:bg-background">
            <span className="text-lg">📚</span>
            Treinamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-6">
          <AgentUsage key={`usage-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="training" className="mt-6">
          <AgentTraining key={`training-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
