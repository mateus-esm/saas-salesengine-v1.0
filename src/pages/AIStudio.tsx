import { useState } from "react";
import { Cpu, RefreshCw, Sparkles, BookOpen, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { AIUsageDashboard } from "@/components/ai-studio/AIUsageDashboard";
import { AIKnowledgeBase } from "@/components/ai-studio/AIKnowledgeBase";
import { AISkills } from "@/components/ai-studio/AISkills";

export default function AIStudio() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8 bg-background">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Cpu className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">AI Studio</h1>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <Sparkles className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Gerencie os provedores, o consumo e o conhecimento da sua IA.
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
        <TabsList className="bg-muted/50 p-1 w-full justify-start overflow-x-auto">
          <TabsTrigger value="usage" className="gap-2 data-[state=active]:bg-background">
            <Cpu className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2 data-[state=active]:bg-background">
            <BookOpen className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="skills" className="gap-2 data-[state=active]:bg-background">
            <Layers className="h-4 w-4" />
            Skills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-6">
          <AIUsageDashboard key={`usage-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6">
          <AIKnowledgeBase key={`knowledge-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="skills" className="mt-6">
          <AISkills key={`skills-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
