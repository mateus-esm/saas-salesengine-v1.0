import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Save, ArrowRightLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const INSTRUCTIONS_LIMIT = 255;

interface TransferRule {
  id: string;
  instructions: string;
  returnOnFinish: boolean;
  notInformWhenTransfer: boolean;
  type: "HUMAN" | "AGENT";
  userId: string | null;
  agentId: string | null;
}

interface Target { id: string; name: string; role: string | null }

/** A rule being edited. `id` is null for one that has not been created yet. */
type Draft = Omit<TransferRule, "id"> & { id: string | null };

const EMPTY_DRAFT: Draft = {
  id: null, instructions: "", returnOnFinish: false,
  notInformWhenTransfer: false, type: "HUMAN", userId: null, agentId: null,
};

export function TransferRulesTab() {
  const { toast } = useToast();
  const [rules, setRules] = useState<TransferRule[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [rulesRes, targetsRes] = await Promise.all([
        supabase.functions.invoke("manage-agent-transfer-rules", { method: "GET" }),
        supabase.functions.invoke("manage-agent-transfer-rules?action=list-targets", { method: "GET" }),
      ]);
      if (rulesRes.error) throw rulesRes.error;
      setRules(Array.isArray(rulesRes.data?.rules) ? rulesRes.data.rules : []);
      // Targets failing is not fatal — the rules list still renders, the editor
      // just cannot offer names.
      setTargets(Array.isArray(targetsRes.data?.targets) ? targetsRes.data.targets : []);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar as regras de transferência.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const targetName = (userId: string | null) =>
    targets.find((t) => t.id === userId)?.name ?? (userId ? "Usuário desconhecido" : "—");

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const action = draft.id ? "update" : "create";
      const { error } = await supabase.functions.invoke(
        `manage-agent-transfer-rules?action=${action}`,
        { body: { ...draft, ruleId: draft.id ?? undefined } }
      );
      if (error) throw error;
      toast({ title: "Salvo!", description: draft.id ? "Regra atualizada." : "Regra criada." });
      setDraft(null);
      await fetchAll();
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  const handleDelete = async (ruleId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(
        "manage-agent-transfer-rules?action=delete", { body: { ruleId } }
      );
      if (error) throw error;
      toast({ title: "Removida", description: "Regra de transferência removida." });
      setDeleteId(null);
      await fetchAll();
    } catch (err) {
      toast({ title: "Erro", description: String((err as any)?.message ?? err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Mirrors the edge function's validation so the user sees the problem before
  // a round trip, not as an opaque 400.
  const draftInvalid = (): string | null => {
    if (!draft) return null;
    if (!draft.instructions.trim()) return "Descreva quando a transferência deve acontecer.";
    if (draft.type === "HUMAN" && !draft.userId) return "Escolha para quem transferir.";
    if (draft.instructions.length > INSTRUCTIONS_LIMIT) return `Máximo de ${INSTRUCTIONS_LIMIT} caracteres.`;
    return null;
  };
  const invalid = draftInvalid();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Regras de transferência
            </span>
          </div>
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar regra
          </Button>
        </div>

        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Configure instruções para o agente fazer transferência do atendimento.
          </p>

          {rules.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <ArrowRightLeft className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma regra configurada</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {rules.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-4 py-3.5">
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm text-foreground">{r.instructions}</div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase text-muted-foreground">
                      <span>
                        {r.type === "HUMAN" ? `→ ${targetName(r.userId)}` : "→ outro agente"}
                      </span>
                      {r.returnOnFinish && <span>· devolve ao finalizar</span>}
                      {r.notInformWhenTransfer && <span>· não informa</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => setDraft({ ...r })}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      {draft && (
        <div className="border border-primary/30 rounded-lg overflow-hidden bg-card">
          <div className="px-5 py-3 border-b border-border bg-primary/5 flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              {draft.id ? "Editar regra" : "Nova regra"}
            </span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDraft(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                Transferir para
              </label>
              <Select
                value={draft.type === "HUMAN" ? (draft.userId ?? "") : "__agent__"}
                onValueChange={(v) =>
                  setDraft((d) => d && (v === "__agent__"
                    ? { ...d, type: "AGENT", userId: null }
                    : { ...d, type: "HUMAN", userId: v, agentId: null }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Escolha um atendente…" /></SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{t.role ? ` · ${t.role.toLowerCase()}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targets.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum atendente disponível — verifique a equipe no provedor.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                  Instruções
                </label>
                <span className={`text-[11px] font-mono ${draft.instructions.length > INSTRUCTIONS_LIMIT ? "text-destructive" : "text-muted-foreground"}`}>
                  {draft.instructions.length}/{INSTRUCTIONS_LIMIT}
                </span>
              </div>
              <Input
                placeholder="Ex: Quando o cliente estiver se mostrando irritado"
                value={draft.instructions}
                onChange={(e) => setDraft((d) => d && { ...d, instructions: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <span className="text-sm font-semibold text-foreground">Devolver ao finalizar</span>
                <p className="text-[11px] text-muted-foreground">
                  Retorna o atendimento ao agente quando o humano encerrar.
                </p>
              </div>
              <Switch
                checked={draft.returnOnFinish}
                onCheckedChange={(c) => setDraft((d) => d && { ...d, returnOnFinish: c })}
              />
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <span className="text-sm font-semibold text-foreground">Não informar quando transferir</span>
                <p className="text-[11px] text-muted-foreground">
                  O cliente não recebe aviso de que foi transferido.
                </p>
              </div>
              <Switch
                checked={draft.notInformWhenTransfer}
                onCheckedChange={(c) => setDraft((d) => d && { ...d, notInformWhenTransfer: c })}
              />
            </div>

            {invalid && <p className="text-[11px] text-destructive">{invalid}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || invalid !== null} className="gap-2 px-6">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Salvando…" : "Salvar regra"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra?</AlertDialogTitle>
            <AlertDialogDescription>
              O agente deixará de transferir o atendimento nessa situação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
