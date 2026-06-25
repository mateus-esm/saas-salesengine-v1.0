import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Grip,
  Info,
  Loader2,
  Plus,
  Save,
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

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

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

          {/* T8 — workspace Origem/Canal taxonomy editor */}
          <OriginTaxonomyEditor />

          {/* Sprint 6.4 W2 — tenant contact-field dictionary */}
          <Card className="max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>Campos do Contato</CardTitle>
              <CardDescription>
                Dicionário de campos compartilhado por todos os pipelines.
                Defina aqui os campos que o copiloto usa para enriquecer e
                identificar contatos — adicione uma descrição para treinar o
                copiloto sobre o que cada campo significa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContactFieldsEditor />
            </CardContent>
          </Card>
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
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description || "");
  const [cadenceDays, setCadenceDays] = useState(
    pipeline.cadence_days ? String(pipeline.cadence_days) : "",
  );
  const [schema, setSchema] = useState<CustomFieldSchema[]>(pipeline.custom_fields_schema);
  const [cardFieldIds, setCardFieldIds] = useState<string[]>(pipeline.card_field_ids);

  const { defaultPipelineId, setDefault } = useDefaultPipeline();
  const isDefault = defaultPipelineId === pipeline.id;

  // All sections start collapsed — clean first impression
  const [identidadeOpen, setIdentidadeOpen] = useState(false);
  const [etapasOpen, setEtapasOpen] = useState(false);
  const [metasOpen, setMetasOpen] = useState(false);
  const [camposOpen, setCamposOpen] = useState(false);

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
  };

  const SectionChevron = () => (
    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Action bar — save / default pipeline */}
      <div className="flex items-center justify-between">
        <div>
          {isDefault && (
            <Badge variant="secondary" className="gap-1">
              <Star className="h-3 w-3" />
              Padrão
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {isDefault ? (
            <Button
              variant="outline"
              onClick={() => setDefault.mutate(null)}
              disabled={setDefault.isPending}
            >
              <StarOff className="h-4 w-4 mr-2" /> Remover padrão
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setDefault.mutate(pipeline.id)}
              disabled={setDefault.isPending}
            >
              <Star className="h-4 w-4 mr-2" /> Tornar padrão
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>

      {/* 1. Identidade */}
      <Collapsible open={identidadeOpen} onOpenChange={setIdentidadeOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Identidade</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                        Nome, descrição e cadência da pipeline. Define a identidade do seu processo de vendas.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <SectionChevron />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Cadência (dias)</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={cadenceDays}
                  onChange={(e) => setCadenceDays(e.target.value)}
                  placeholder="Ex.: 2"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Vazio desativa o cálculo automático de próximo contato.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 2. Etapas */}
      <Collapsible open={etapasOpen} onOpenChange={setEtapasOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Etapas</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                        Configure as etapas do funil: nome, tipo (aberto/ganho/perdido), SLA, e descrições que treinam o Copiloto.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <SectionChevron />
              </div>
              <CardDescription>
                Arraste para reordenar. O tipo da etapa (aberto / ganho / perdido)
                controla quais leads aparecem nos relatórios. Defina a descrição
                (para treinar o copiloto) e o SLA (horas máximas) de cada etapa.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <StagesEditor pipelineId={pipeline.id} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 3. Metas */}
      <Collapsible open={metasOpen} onOpenChange={setMetasOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Metas</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                        Defina metas mensais ou trimestrais. Alimenta o placar de receita no Kanban.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <SectionChevron />
              </div>
              <CardDescription>
                Defina a meta mensal ou trimestral de negócios fechados para esta
                pipeline. Usado nos relatórios de previsão.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <RevenueGoalsForm pipelineId={pipeline.id} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 4. Campos Personalizados */}
      <Collapsible open={camposOpen} onOpenChange={setCamposOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grip className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Campos Personalizados</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                        Crie campos exclusivos desta pipeline e escolha quais aparecem no card do Kanban.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <SectionChevron />
              </div>
              <CardDescription>
                Defina campos exclusivos desta pipeline e escolha quais aparecem
                no card do Kanban. Lembre de salvar.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              <CustomFieldsEditor
                schema={schema}
                cardFieldIds={cardFieldIds}
                onChange={({ schema: s, cardFieldIds: c }) => {
                  setSchema(s);
                  setCardFieldIds(c);
                }}
              />
              <CardFieldsPicker
                schema={schema}
                cardFieldIds={cardFieldIds}
                onChange={setCardFieldIds}
              />
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
