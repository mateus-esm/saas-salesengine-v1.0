import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Grip,
  Info,
  Loader2,
  Plus,
  Save,
  Settings,
  Star,
  StarOff,
  Tag,
  GitBranch,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { usePipelines } from "@/hooks/usePipelines";
import { useDefaultPipeline } from "@/hooks/useDefaultPipeline";
import { PipelineList } from "@/components/crm/pipeline-settings/PipelineList";
import { StagesEditor } from "@/components/crm/pipeline-settings/StagesEditor";
import { CustomFieldsEditor } from "@/components/crm/pipeline-settings/CustomFieldsEditor";
import { CardFieldsPicker } from "@/components/crm/pipeline-settings/CardFieldsPicker";
import { OriginTaxonomyEditor } from "@/components/crm/pipeline-settings/OriginTaxonomyEditor";
import { ContactFieldsEditor } from "@/components/crm/pipeline-settings/ContactFieldsEditor";
import { RevenueGoalsForm } from "@/components/crm/revenue/RevenueGoalsForm";
import type { CustomFieldSchema, Pipeline } from "@/types/pipelines";

const PipelineSettings = () => {
  const {
    pipelines,
    activePipelines,
    archivedPipelines,
    isLoading,
    createPipeline,
    updatePipeline,
    archivePipeline,
    deletePipeline,
  } = usePipelines();

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"active" | "archived">("active");
  // Seed selection from ?selected= URL param; fall back to null
  const [selectedId, setSelectedId_] = useState<string | null>(
    searchParams.get("selected") || null
  );
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

  // Keep URL in sync when selection changes
  const setSelectedId = (id: string | null) => {
    setSelectedId_(id);
    if (id) {
      setSearchParams({ selected: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Auto-select first available pipeline of the visible tab
  useEffect(() => {
    const list = tab === "active" ? activePipelines : archivedPipelines;
    if (list.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !list.some((p) => p.id === selectedId)) {
      setSelectedId(list[0].id);
    }
  }, [tab, activePipelines, archivedPipelines, selectedId]);

  const selected = useMemo(
    () => pipelines.find((p) => p.id === selectedId) || null,
    [pipelines, selectedId],
  );

  const handleCreate = async () => {
    if (!draftName.trim()) return;
    try {
      const created = await createPipeline.mutateAsync({
        name: draftName.trim(),
        description: draftDesc.trim() || undefined,
      });
      setSelectedId(created.id);
      setTab("active");
      setDraftName("");
      setDraftDesc("");
      setCreatingOpen(false);
    } catch {
      // toast handled in hook
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <Link
          to="/crm"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-1"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar ao CRM
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pipelines</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure processos de venda. Cada pipeline tem suas próprias etapas e
              campos personalizados.
            </p>
          </div>
          <Button onClick={() => setCreatingOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Pipeline
          </Button>
        </div>
      </div>

      {/* Body — two-pane layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr]">
        {/* Left pane: list */}
        <aside className="border-r border-border bg-card/30 flex flex-col">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")} className="flex-1 flex flex-col">
            <div className="px-4 pt-4">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="active">
                  Ativas ({activePipelines.length})
                </TabsTrigger>
                <TabsTrigger value="archived">
                  Arquivadas ({archivedPipelines.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <TabsContent value="active" className="m-0">
                    <PipelineList
                      pipelines={activePipelines}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onArchive={(id, archived) => archivePipeline.mutate({ id, archived })}
                      onDelete={(id) => deletePipeline.mutate(id)}
                    />
                  </TabsContent>
                  <TabsContent value="archived" className="m-0">
                    <PipelineList
                      pipelines={archivedPipelines}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onArchive={(id, archived) => archivePipeline.mutate({ id, archived })}
                      onDelete={(id) => deletePipeline.mutate(id)}
                    />
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </aside>

        {/* Right pane: editor */}
        <main className="overflow-auto p-6 space-y-6">
          {selected ? (
            <PipelineEditor
              key={selected.id}
              pipeline={selected}
              onSave={(patch) => updatePipeline.mutate({ id: selected.id, ...patch })}
            />
          ) : (
            <EmptyEditorState onCreate={() => setCreatingOpen(true)} />
          )}
        </main>
      </div>

      {/* Create dialog */}
      <Dialog open={creatingOpen} onOpenChange={setCreatingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Ex.: Vendas Solar"
                autoFocus
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                rows={3}
                placeholder="Para que esta pipeline serve?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!draftName.trim() || createPipeline.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PipelineSettings;

// ─────────────────────────────────────────────────────────────────────

interface PipelineEditorDraft {
  name: string;
  description: string;
  cadenceDays: string;
  cardFieldIds: string[];
}

interface PipelineEditorProps {
  pipeline: Pipeline;
  onSave: (patch: {
    name?: string;
    description?: string | null;
    cadence_days?: number | null;
    custom_fields_schema?: CustomFieldSchema[];
    card_field_ids?: string[];
  }) => void;
}

const PipelineEditor = ({ pipeline, onSave }: PipelineEditorProps) => {
  const [schema, setSchema] = useState<CustomFieldSchema[]>(pipeline.custom_fields_schema);

  const { defaultPipelineId, setDefault } = useDefaultPipeline();
  const isDefault = defaultPipelineId === pipeline.id;

  // All sections start collapsed — clean first impression
  const [identidadeOpen, setIdentidadeOpen] = useState(false);
  const [etapasOpen, setEtapasOpen] = useState(false);
  const [metasOpen, setMetasOpen] = useState(false);
  const [automacoesOpen, setAutomacoesOpen] = useState(false);
  const [origemOpen, setOrigemOpen] = useState(false);
  const [camposOpen, setCamposOpen] = useState(false);
  const [geralOpen, setGeralOpen] = useState(false);

  // ── Draft persistence — in-progress edits survive navigation ──
  const draftKey = `pipeline_editor_${pipeline.id}`;
  const { value, setValue, commit } = useDraftAutosave<PipelineEditorDraft>(draftKey, {
    name: pipeline.name,
    description: pipeline.description || "",
    cadenceDays: pipeline.cadence_days ? String(pipeline.cadence_days) : "",
    cardFieldIds: pipeline.card_field_ids,
  });
  const { name, description, cadenceDays, cardFieldIds } = value;
  const updateField = (k: keyof PipelineEditorDraft, v: PipelineEditorDraft[keyof PipelineEditorDraft]) =>
    setValue((prev) => ({ ...prev, [k]: v }));

  const dirty =
    name !== pipeline.name ||
    (description || "") !== (pipeline.description || "") ||
    cadenceDays !== (pipeline.cadence_days ? String(pipeline.cadence_days) : "") ||
    JSON.stringify(schema) !== JSON.stringify(pipeline.custom_fields_schema) ||
    JSON.stringify(cardFieldIds) !== JSON.stringify(pipeline.card_field_ids);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const parsedCadence = cadenceDays.trim() ? Number(cadenceDays) : null;
    if (parsedCadence !== null && (!Number.isInteger(parsedCadence) || parsedCadence <= 0)) {
      toast.error("Cadência deve ser um número inteiro maior que zero");
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      cadence_days: parsedCadence,
      custom_fields_schema: schema,
      card_field_ids: cardFieldIds,
    });
    toast.success("Pipeline salva");
    commit();
  };

  const SectionChevron = () => (
    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Summary bar ── */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{name || pipeline.name}</h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {isDefault && (
                  <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
                    <Star className="h-3 w-3" />
                    Padrão
                  </Badge>
                )}
                {description && <span>{description}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isDefault ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDefault.mutate(null)}
                  disabled={setDefault.isPending}
                  className="text-xs"
                >
                  <StarOff className="h-3 w-3 mr-1" /> Remover padrão
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDefault.mutate(pipeline.id)}
                  disabled={setDefault.isPending}
                  className="text-xs"
                >
                  <Star className="h-3 w-3 mr-1" /> Tornar padrão
                </Button>
              )}
              <Button onClick={handleSave} disabled={!dirty} size="sm">
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 1. Identidade ── */}
      <Collapsible open={identidadeOpen} onOpenChange={setIdentidadeOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Identidade</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!identidadeOpen && (
                <CardDescription className="mt-1">
                  Nome e descrição da pipeline para identificar o processo de vendas.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => updateField("name", e.target.value)} placeholder="Ex.: Vendas Solar" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={3}
                  placeholder="Para que serve esta pipeline? Ex.: Leads qualificados de energia solar residencial."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  A descrição ajuda o copiloto a entender o contexto e classificar leads corretamente.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 2. Etapas ── */}
      <Collapsible open={etapasOpen} onOpenChange={setEtapasOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Etapas</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!etapasOpen && (
                <CardDescription className="mt-1">
                  Etapas do funil de vendas: nome, SLA, cadência e regras de ciclo para cada estágio.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <StagesEditor pipelineId={pipeline.id} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 3. Metas ── */}
      <Collapsible open={metasOpen} onOpenChange={setMetasOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Metas</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!metasOpen && (
                <CardDescription className="mt-1">
                  Metas mensais ou trimestrais de negócios fechados. Alimenta o placar de performance no Kanban.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <RevenueGoalsForm pipelineId={pipeline.id} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 4. Automações (shortcut) ── */}
      <Collapsible open={automacoesOpen} onOpenChange={setAutomacoesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Automações</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!automacoesOpen && (
                <CardDescription className="mt-1">
                  Regras automáticas que o agente segue: gatilhos, ações e instruções de treinamento.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Configure as regras automáticas do agente para esta pipeline na aba <strong>Copilot</strong> do pipeline.
              </p>
              <p className="text-xs text-muted-foreground">
                Inclui: gatilhos baseados em intenção do lead, mensagens recebidas, tempo ocioso, entrada em etapas e campos preenchidos.
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 5. Origem & Canal ── */}
      <Collapsible open={origemOpen} onOpenChange={setOrigemOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Origem &amp; Canal</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!origemOpen && (
                <CardDescription className="mt-1">
                  Tags que classificam como cada lead chegou até você. Compartilhado entre todos os pipelines.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <OriginTaxonomyEditor />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 6. Campos do Contato ── */}
      <Collapsible open={camposOpen} onOpenChange={setCamposOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grip className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Campos do Contato</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!camposOpen && (
                <CardDescription className="mt-1">
                  Dicionário de campos compartilhado por todos os pipelines. Use descrições para treinar o copiloto.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              <ContactFieldsEditor />
              <div className="border-t border-border pt-4">
                <CardFieldsPicker
                  schema={schema}
                  cardFieldIds={cardFieldIds}
                  onChange={(ids) => updateField("cardFieldIds", ids)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Escolha quais campos aparecem nos cards do Kanban para acesso rápido.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 7. Geral (configurações avançadas) ── */}
      <Collapsible open={geralOpen} onOpenChange={setGeralOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Geral</CardTitle>
                </div>
                <SectionChevron />
              </div>
              {!geralOpen && (
                <CardDescription className="mt-1">
                  Configurações avançadas: cadência, campos personalizados da pipeline e visibilidade nos cards.
                </CardDescription>
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              <div>
                <Label>Cadência (dias)</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={cadenceDays}
                  onChange={(e) => updateField("cadenceDays", e.target.value)}
                  placeholder="Ex.: 2"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Intervalo padrão entre contatos automáticos. Vazio desativa o cálculo automático. Cada etapa pode ter seu próprio valor.
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <CustomFieldsEditor
                  schema={schema}
                  cardFieldIds={cardFieldIds}
                  onChange={({ schema: s, cardFieldIds: c }) => {
                    setSchema(s);
                    updateField("cardFieldIds", c);
                  }}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Campos personalizados são exclusivos desta pipeline. Use para coletar informações específicas do seu processo.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};

const EmptyEditorState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="h-full flex items-center justify-center p-8">
    <div className="max-w-sm text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <GitBranch className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Nenhuma pipeline selecionada</h2>
      <p className="text-sm text-muted-foreground">
        Selecione uma pipeline ao lado ou crie uma nova para começar a estruturar seus processos de venda.
      </p>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4 mr-2" /> Criar Pipeline
      </Button>
    </div>
  </div>
);
