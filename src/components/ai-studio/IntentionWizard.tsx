import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Zap, Globe, Code, ToggleLeft, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IntentionFormData {
  name: string;
  description: string;
  details: string;
  type: 'WEBHOOK' | 'INSTRUCTIONS';
  httpMethod: string;
  url: string;
  instructions: string;
  headers: { name: string; value: string }[];
  autoGenerateParams: boolean;
  autoGenerateBody: boolean;
}

interface IntentionWizardProps {
  initialData?: Partial<IntentionFormData>;
  onSave: (data: IntentionFormData) => Promise<void>;
  onClose: () => void;
}

const STEPS = ['Detalhes', 'Ação', 'Configurações'];

export function IntentionWizard({ initialData, onSave, onClose }: IntentionWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");

  const [form, setForm] = useState<IntentionFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    details: initialData?.details || '',
    type: initialData?.type || 'WEBHOOK',
    httpMethod: initialData?.httpMethod || 'POST',
    url: initialData?.url || '',
    instructions: initialData?.instructions || '',
    headers: initialData?.headers || [],
    autoGenerateParams: initialData?.autoGenerateParams ?? false,
    autoGenerateBody: initialData?.autoGenerateBody ?? false,
  });

  const addHeader = () => {
    if (headerName.trim()) {
      setForm(prev => ({
        ...prev,
        headers: [...prev.headers, { name: headerName.trim(), value: headerValue }],
      }));
      setHeaderName("");
      setHeaderValue("");
    }
  };

  const removeHeader = (index: number) => {
    setForm(prev => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
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
              <h2 className="font-bold text-lg text-card-foreground">{initialData?.name ? 'Editar Intenção' : 'Nova Intenção'}</h2>
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
                <label className="text-sm font-medium text-foreground">Nome da Intenção</label>
                <input
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                  placeholder="Ex: Agendar Reunião"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Usado internamente para identificar a intenção na lista.</p>
              </div>
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
                    <label className="text-sm font-medium text-foreground">Headers</label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        placeholder="x-api-key"
                        value={headerName}
                        onChange={(e) => setHeaderName(e.target.value)}
                      />
                      <input
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        placeholder="seu-token"
                        value={headerValue}
                        onChange={(e) => setHeaderValue(e.target.value)}
                      />
                      <Button variant="outline" size="sm" onClick={addHeader}>+</Button>
                    </div>
                    {form.headers.length > 0 && (
                      <div className="space-y-1.5">
                        {form.headers.map((h, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs font-mono bg-muted/50 px-3 py-2 rounded-lg">
                            <span className="text-foreground font-semibold">{h.name}:</span>
                            <span className="text-muted-foreground flex-1">{h.value}</span>
                            <button onClick={() => removeHeader(i)} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
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
                      <p className="text-sm font-medium text-foreground">Auto-generate Params</p>
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
                      <p className="text-sm font-medium text-foreground">Auto-generate Body</p>
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
            <Button onClick={() => setStep(step + 1)} className="gap-2" disabled={step === 0 && !form.name.trim()}>
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
