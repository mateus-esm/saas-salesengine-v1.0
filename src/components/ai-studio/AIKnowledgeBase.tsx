import { useState } from "react";
import { BookOpen, FileText, Globe, Video, FolderGit2, Briefcase } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function AIKnowledgeBase() {
  const [activeCategory, setActiveCategory] = useState("perfil");

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      {/* Sidebar Categories */}
      <div className="col-span-1 md:col-span-3 space-y-2">
        <button 
          onClick={() => setActiveCategory("perfil")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            activeCategory === "perfil" 
              ? "bg-primary/10 text-primary" 
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          Perfil
        </button>
        <button 
          onClick={() => setActiveCategory("trabalho")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            activeCategory === "trabalho" 
              ? "bg-primary/10 text-primary" 
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Trabalho
        </button>
      </div>

      {/* Main Content Area */}
      <div className="col-span-1 md:col-span-9">
        <div className="p-6 rounded-xl border border-border bg-card">
          <h2 className="text-xl font-bold mb-6 text-card-foreground flex items-center gap-2">
            {activeCategory === "perfil" ? "Dados de Perfil" : "Dados de Trabalho"} 
          </h2>
          
          <Tabs defaultValue="text">
            <TabsList className="bg-muted/50 mb-6">
              <TabsTrigger value="text" className="gap-2">
                <FileText className="w-4 h-4" /> Texto
              </TabsTrigger>
              <TabsTrigger value="document" className="gap-2">
                <BookOpen className="w-4 h-4" /> Documentos
              </TabsTrigger>
              <TabsTrigger value="website" className="gap-2">
                <Globe className="w-4 h-4" /> URLs
              </TabsTrigger>
              <TabsTrigger value="video" className="gap-2">
                <Video className="w-4 h-4" /> Vídeo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <div className="w-full relative">
                <textarea 
                  className="w-full min-h-[200px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="Cole aqui o texto para a IA processar..."
                />
              </div>
              <div className="flex justify-end">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Salvar Conhecimento
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="document" className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center bg-background/50 hover:bg-background transition-colors cursor-pointer">
                <FileText className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">Clique ou arraste um PDF aqui</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos suportados: PDF, DOCX (Max 20MB)</p>
              </div>
            </TabsContent>

            <TabsContent value="website" className="space-y-4">
              <div className="flex gap-2">
                <input 
                  type="url" 
                  placeholder="https://sua-empresa.com.br"
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                />
                <Button>Adicionar URL</Button>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                O AI Studio vai acessar e extrair o conteúdo dessa página automaticamente.
              </div>
            </TabsContent>

            <TabsContent value="video" className="space-y-4">
              <div className="flex gap-2">
                <input 
                  type="url" 
                  placeholder="Link do Youtube..."
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                />
                <Button>Transcrever e Treinar</Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
