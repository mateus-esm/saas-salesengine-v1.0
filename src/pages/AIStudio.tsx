import { AIUsageDashboard } from "@/components/ai-studio/AIUsageDashboard";
import { AIKnowledgeBase } from "@/components/ai-studio/AIKnowledgeBase";
import { AISkills } from "@/components/ai-studio/AISkills";

export default function AIStudio() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background relative overflow-hidden">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 lg:p-8 space-y-12">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Studio</h1>
            <p className="text-muted-foreground mt-2">
              Camada de orquestração do comportamento, memória e gatilhos lógicos dos seus Agentes de IA.
            </p>
          </div>
        </div>

        {/* Folder Layout: Stack components vertically */}
        <div className="space-y-12 pb-12">
           {/* 1. Usage & Analytics */}
           <section>
             <AIUsageDashboard />
           </section>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
             {/* 2. Knowledge Base (Folders: Perfil, Empresa, Treinamentos) */}
             <section>
               <AIKnowledgeBase />
             </section>

             {/* 3. Skills & Intentions (Folder: Intenções) */}
             <section>
               <AISkills />
             </section>
           </div>
        </div>
      </div>
    </div>
  );
}
