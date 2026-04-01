import { Navigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNavbar } from "@/components/TopNavbar";
import { AIUsageDashboard } from "@/components/ai-studio/AIUsageDashboard";
import { AIKnowledgeBase } from "@/components/ai-studio/AIKnowledgeBase";
import { AISkills } from "@/components/ai-studio/AISkills";

export default function AIStudio() {
  const { isOnline } = useAuth();

  if (!isOnline) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar />
        <main className="flex-1 overflow-y-auto w-full p-4 md:p-6 lg:p-8">
          <div className="max-w-[1400px] mx-auto space-y-12">
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
            <div className="space-y-12">
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
        </main>
      </div>
    </div>
  );
}
