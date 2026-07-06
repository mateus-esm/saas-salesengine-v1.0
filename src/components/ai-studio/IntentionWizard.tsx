import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Zap, Globe, Loader2, BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type IntentionType = 'WEBHOOK' | 'INSTRUCTIONS';
type FieldType = 'STRING' | 'URL' | 'DATE_TIME' | 'DATE' | 'NUMBER' | 'BOOLEAN';

interface KeyValueRow {
  name: string;
  value: string;
}

interface IntentionField {
  name: string;
  jsonName: string;
  description: string;
  type: FieldType;
  required: boolean;
}

interface IntentionVariable {
  valueExpression: string;
  defaultFieldKey: string;
}

interface IntentionFormData {
  description: string;
  details: string;
  type: IntentionType;
  httpMethod: string;
  url: string;
  instructions: string;
  headers: KeyValueRow[];
  params: KeyValueRow[];
  fields: IntentionField[];
  variables: IntentionVariable[];
  autoGenerateParams: boolean;
  autoGenerateBody: boolean;
}

interface IntentionWizardProps {
  initialData?: Partial<IntentionFormData>;
  onSave: (data: IntentionFormData) => Promise<void>;
  onClose: () => void;
}

const STEPS = ['Detalhes', 'Ação', 'Configurações'];

const FIELD_TYPES: FieldType[] = ['STRING', 'URL', 'DATE_TIME', 'DATE', 'NUMBER', 'BOOLEAN'];
const DEFAULT_FIELD_KEYS = [
  'chat_id',
  'contact_name',
  'contact_phone',
  'contact_email',
  'contact_gender',
  'contact_birthday',
  'contact_job_title',
  'contact_org_name',
  'contact_org_state',
  'contact_org_city',
];

const emptyKeyValueRow = (): KeyValueRow => ({ name: '', value: '' });
const emptyField = (): IntentionField => ({
  name: '',
  jsonName: '',
  description: '',
  type: 'STRING',
  required: false,
});
const emptyVariable = (): IntentionVariable => ({
  valueExpression: '',
  defaultFieldKey: 'contact_phone',
});

export function IntentionWizard({ initialData, onSave, onClose }: IntentionWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<IntentionFormData>({
    description: initialData?.description || '',
    details: initialData?.details || '',
    type: initialData?.type || 'WEBHOOK',
    httpMethod: initialData?.httpMethod || 'POST',
    url: initialData?.url || '',
    instructions: initialData?.instructions || '',
    headers: initialData?.headers || [],
    params: initialData?.params || [],
    fields: initialData?.fields || [],
    variables: initialData?.variables || [],
    autoGenerateParams: initialData?.autoGenerateParams ?? false,
    autoGenerateBody: initialData?.autoGenerateBody ?? false,
  });

  const addHeader = () => {
    setForm(prev => ({ ...prev, headers: [...prev.headers, emptyKeyValueRow()] }));
  };

  const updateHeader = (index: number, patch: Partial<KeyValueRow>) => {
    setForm(prev => ({
      ...prev,
      headers: prev.headers.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const removeHeader = (index: number) => {
    setForm(prev => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  const addParam = () => {
    setForm(prev => ({ ...prev, params: [...prev.params, emptyKeyValueRow()] }));
  };

  const updateParam = (index: number, patch: Partial<KeyValueRow>) => {
    setForm(prev => ({
      ...prev,
      params: prev.params.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const removeParam = (index: number) => {
    setForm(prev => ({
      ...prev,
      params: prev.params.filter((_, i) => i !== index),
    }));
  };

  const addField = () => {
    setForm(prev => ({ ...prev, fields: [...prev.fields, emptyField()] }));
  };

  const updateField = (index: number, patch: Partial<IntentionField>) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const removeField = (index: number) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const addVariable = () => {
    setForm(prev => ({ ...prev, variables: [...prev.variables, emptyVariable()] }));
  };

  const updateVariable = (index: number, patch: Partial<IntentionVariable>) => {
    setForm(prev => ({
      ...prev,
      variables: prev.variables.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const removeVariable = (index: number) => {
    setForm(prev => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  };

  const pruneKeyValueRows = (rows: KeyValueRow[]) => {
    return rows.filter(row => row.name.trim()).map(row => ({ ...row, name: row.name.trim() }));
  };

  const pruneFields = (fields: IntentionField[]) => {
    return fields.filter(field => field.name.trim() || field.jsonName.trim()).map(field => ({
      ...field,
      name: field.name.trim(),
      jsonName: field.jsonName.trim(),
      description: field.description.trim(),
    }));
  };

  const pruneVariables = (variables: IntentionVariable[]) => {
    return variables
      .filter(variable => variable.valueExpression.trim() || variable.defaultFieldKey.trim())
      .map(variable => ({
        ...variable,
        valueExpression: variable.valueExpression.trim(),
        defaultFieldKey: variable.defaultFieldKey.trim(),
      }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...form,
        headers: pruneKeyValueRows(form.headers),
        params: pruneKeyValueRows(form.params),
        fields: pruneFields(form.fields),
        variables: pruneVariables(form.variables),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-card-foreground">{initialData?.description ? 'Editar Intenção' : 'Nova Intenção'}</h2>
              <p className="text-xs text-muted-foreground">Passo {step + 1} de {STEPS.length}: {STEPS[step]}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>

        {/* Step Indicator */}
        <div className="flex gap-1 px-5 pt-4">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* Step Content */}
        <div className="p-5 space-y-5">
          {/* STEP 1: Detalhes */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Descrição (quando usar)</label>
                <textarea
                  className="w-full min-h-[80px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="Quando o cliente quiser agendar uma reunião com a equipe..."
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Detalhes (instruções adicionais para o agente)</label>
                <textarea
                  className="w-full min-h-[80px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="Quando o cliente pedir para falar com um humano ou agendar demo, pergunte primeiro o melhor horário..."
                  value={form.details}
                  onChange={(e) => setForm(prev => ({ ...prev, details: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Detalhes complementares que ajudam o agente a decidir quando disparar esta intenção.</p>
              </div>
            </>
          )}

          {/* STEP 2: Ação (WEBHOOK vs INSTRUCTIONS) */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tipo de Ação</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setForm(prev => ({ ...prev, type: 'WEBHOOK' }))}
                    className={`p-4 border rounded-xl text-left transition-colors ${
                      form.type === 'WEBHOOK'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <Globe className="w-5 h-5 mb-2 text-primary" />
                    <p className="text-sm font-medium text-foreground">Webhook</p>
                    <p className="text-xs text-muted-foreground mt-1">Chamar uma API externa via HTTP.</p>
                  </button>
                  <button
                    onClick={() => setForm(prev => ({ ...prev, type: 'INSTRUCTIONS' }))}
                    className={`p-4 border rounded-xl text-left transition-colors ${
                      form.type === 'INSTRUCTIONS'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <BookOpen className="w-5 h-5 mb-2 text-primary" />
                    <p className="text-sm font-medium text-foreground">Instrução</p>
                    <p className="text-xs text-muted-foreground mt-1">O agente segue uma instrução específica sem chamar API.</p>
                  </button>
                </div>
              </div>

              {form.type === 'WEBHOOK' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">URL do Webhook</label>
                    <div className="flex gap-2">
                      <select
                        className="bg-background border border-border rounded-lg px-3 py-3 text-sm font-mono font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground w-24"
                        value={form.httpMethod}
                        onChange={(e) => setForm(prev => ({ ...prev, httpMethod: e.target.value }))}
                      >
                        <option>POST</option>
                        <option>GET</option>
                        <option>PUT</option>
                        <option>DELETE</option>
                      </select>
                      <input
                        className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        placeholder="https://api.exemplo.com/webhook"
                        value={form.url}
                        onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-foreground">Cabeçalhos</label>
                      <Button variant="outline" size="sm" onClick={addHeader} className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar
                      </Button>
                    </div>
                    {form.headers.length > 0 && (
                      <div className="space-y-2">
                        {form.headers.map((h, i) => (
                          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                            <input
                              className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                              placeholder="x-api-key"
                              value={h.name}
                              onChange={(e) => updateHeader(i, { name: e.target.value })}
                            />
                            <input
                              className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                              placeholder="valor"
                              value={h.value}
                              onChange={(e) => updateHeader(i, { value: e.target.value })}
                            />
                            <Button variant="ghost" size="icon" onClick={() => removeHeader(i)} className="h-9 w-9 text-muted-foreground hover:text-red-500">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {form.type === 'INSTRUCTIONS' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Instrução para o Agente</label>
                  <textarea
                    className="w-full min-h-[160px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    placeholder="Pergunte ao cliente qual o melhor horário e dia para a reunião, confirme os dados e finalize o agendamento."
                    value={form.instructions}
                    onChange={(e) => setForm(prev => ({ ...prev, instructions: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Variáveis disponíveis: <code className="bg-muted px-1 rounded font-mono">{'{{contact_name}}'}</code>, <code className="bg-muted px-1 rounded font-mono">{'{{contact_phone}}'}</code>
                  </p>
                </div>
              )}
            </>
          )}

          {/* STEP 3: Configurações */}
          {step === 2 && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Geração Automática</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border border-border rounded-xl bg-background">
                    <div>
                      <p className="text-sm font-medium text-foreground">Gerar parâmetros automaticamente</p>
                      <p className="text-xs text-muted-foreground">Gerar automaticamente os parâmetros da requisição a partir do contexto.</p>
                    </div>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, autoGenerateParams: !prev.autoGenerateParams }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${form.autoGenerateParams ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.autoGenerateParams ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-border rounded-xl bg-background">
                    <div>
                      <p className="text-sm font-medium text-foreground">Gerar corpo automaticamente</p>
                      <p className="text-xs text-muted-foreground">Gerar automaticamente o corpo da requisição a partir do contexto.</p>
                    </div>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, autoGenerateBody: !prev.autoGenerateBody }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${form.autoGenerateBody ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.autoGenerateBody ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Parâmetros</h3>
                      <p className="text-xs text-muted-foreground">Pares chave/valor enviados na requisição.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addParam} className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </Button>
                  </div>
                  {form.params.length > 0 && (
                    <div className="space-y-2">
                      {form.params.map((param, i) => (
                        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                          <input
                            className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            placeholder="source"
                            value={param.name}
                            onChange={(e) => updateParam(i, { name: e.target.value })}
                          />
                          <input
                            className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            placeholder="crm"
                            value={param.value}
                            onChange={(e) => updateParam(i, { value: e.target.value })}
                          />
                          <Button variant="ghost" size="icon" onClick={() => removeParam(i)} className="h-9 w-9 text-muted-foreground hover:text-red-500">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Campos do corpo</h3>
                      <p className="text-xs text-muted-foreground">Schema dos dados que o agente deve coletar antes de enviar.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addField} className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </Button>
                  </div>
                  {form.fields.length > 0 && (
                    <div className="space-y-3">
                      {form.fields.map((field, i) => (
                        <div key={i} className="space-y-2 border border-border rounded-xl p-3 bg-background">
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                            <input
                              className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                              placeholder="Nome visível"
                              value={field.name}
                              onChange={(e) => updateField(i, { name: e.target.value })}
                            />
                            <input
                              className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                              placeholder="jsonName"
                              value={field.jsonName}
                              onChange={(e) => updateField(i, { jsonName: e.target.value })}
                            />
                            <Button variant="ghost" size="icon" onClick={() => removeField(i)} className="h-9 w-9 text-muted-foreground hover:text-red-500">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <textarea
                            className="w-full min-h-[64px] bg-background border border-border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            placeholder="Descrição do dado que deve ser coletado"
                            value={field.description}
                            onChange={(e) => updateField(i, { description: e.target.value })}
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                            <select
                              className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                              value={field.type}
                              onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                            >
                              {FIELD_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                            <label className="flex items-center gap-2 text-sm text-foreground px-1">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateField(i, { required: e.target.checked })}
                              />
                              Obrigatório
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Variáveis</h3>
                      <p className="text-xs text-muted-foreground">Valores do contexto da conversa enviados junto com a intenção.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addVariable} className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </Button>
                  </div>
                  {form.variables.length > 0 && (
                    <div className="space-y-2">
                      {form.variables.map((variable, i) => (
                        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-2 items-center">
                          <input
                            className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            placeholder="{{contact_phone}}"
                            value={variable.valueExpression}
                            onChange={(e) => updateVariable(i, { valueExpression: e.target.value })}
                          />
                          <select
                            className="min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            value={variable.defaultFieldKey}
                            onChange={(e) => updateVariable(i, { defaultFieldKey: e.target.value })}
                          >
                            {!DEFAULT_FIELD_KEYS.includes(variable.defaultFieldKey) && variable.defaultFieldKey && (
                              <option value={variable.defaultFieldKey}>{variable.defaultFieldKey}</option>
                            )}
                            {DEFAULT_FIELD_KEYS.map(key => (
                              <option key={key} value={key}>{key}</option>
                            ))}
                          </select>
                          <Button variant="ghost" size="icon" onClick={() => removeVariable(i)} className="h-9 w-9 text-muted-foreground hover:text-red-500">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, o agente infere os parâmetros/corpo da requisição com base na conversa e no schema configurado.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onClose()} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            {step > 0 ? 'Voltar' : 'Cancelar'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} className="gap-2" disabled={step === 0 && !form.description.trim()}>
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Salvar Intenção
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
