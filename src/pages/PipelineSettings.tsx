import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { usePipelines } from "@/hooks/usePipelines";
import { PipelineList } from "@/components/crm/pipeline-settings/PipelineList";
import { StagesEditor } from "@/components/crm/pipeline-settings/StagesEditor";
import { CustomFieldsEditor } from "@/components/crm/pipeline-settings/CustomFieldsEditor";
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
        <main className="overflow-auto p-6">
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

interface PipelineEditorProps {
  pipeline: Pipeline;
  onSave: (patch: {
    name?: string;
    description?: string | null;
    custom_fields_schema?: CustomFieldSchema[];
    card_field_ids?: string[];
  }) => void;
}

const PipelineEditor = ({ pipeline, onSave }: PipelineEditorProps) => {
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description || "");
  const [schema, setSchema] = useState<CustomFieldSchema[]>(pipeline.custom_fields_schema);
  const [cardFieldIds, setCardFieldIds] = useState<string[]>(pipeline.card_field_ids);

  const dirty =
    name !== pipeline.name ||
    (description || "") !== (pipeline.description || "") ||
    JSON.stringify(schema) !== JSON.stringify(pipeline.custom_fields_schema) ||
    JSON.stringify(cardFieldIds) !== JSON.stringify(pipeline.card_field_ids);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      custom_fields_schema: schema,
      card_field_ids: cardFieldIds,
    });
    toast.success("Pipeline salva");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Configurações da Pipeline</CardTitle>
              <CardDescription>
                Identidade e descrição. Use a coluna esquerda para arquivar ou
                excluir.
              </CardDescription>
            </div>
            <Button onClick={handleSave} disabled={!dirty}>
              <Save className="h-4 w-4 mr-2" /> Salvar
            </Button>
          </div>
        </CardHeader>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas</CardTitle>
          <CardDescription>
            Arraste para reordenar. O tipo da etapa (aberto / ganho / perdido)
            controla quais oportunidades aparecem nos relatórios futuros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StagesEditor pipelineId={pipeline.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campos Personalizados</CardTitle>
          <CardDescription>
            Defina os campos exclusivos desta pipeline. Use o ícone de olho para
            escolher quais aparecem nos cards do Kanban. Lembre de salvar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomFieldsEditor
            schema={schema}
            cardFieldIds={cardFieldIds}
            onChange={({ schema: s, cardFieldIds: c }) => {
              setSchema(s);
              setCardFieldIds(c);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
};

const EmptyEditorState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="h-full flex items-center justify-center">
    <div className="max-w-sm text-center space-y-4">
      <h2 className="text-lg font-medium">Nenhuma pipeline selecionada</h2>
      <p className="text-sm text-muted-foreground">
        Crie sua primeira pipeline para começar a estruturar processos de venda
        independentes — cada um com suas etapas e campos personalizados.
      </p>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4 mr-2" /> Criar Pipeline
      </Button>
    </div>
  </div>
);
