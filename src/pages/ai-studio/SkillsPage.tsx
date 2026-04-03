import { AISkills } from "@/components/ai-studio/AISkills";

export default function SkillsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
          AI Studio / Skills
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Skills & Intenções
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure gatilhos na conversa para disparar webhooks, ações no sistema ou respostas fixas.
        </p>
      </div>

      <AISkills />
    </div>
  );
}
