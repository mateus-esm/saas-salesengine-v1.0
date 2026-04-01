import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Zap, Globe, Code, ToggleLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IntentionFormData {
  name: string;
  description: string;
  triggers: string[];
  webhook: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers: Record<string, string>;
    body: string;
  };
  persistVariables: boolean;
  responseType: 'ai_interpretation' | 'fixed_text';
  fixedResponse: string;
}

interface IntentionWizardProps {
  initialData?: Partial<IntentionFormData>;
  onSave: (data: IntentionFormData) => Promise<void>;
  onClose: () => void;
}

const STEPS = ['Detalhes', 'Webhook', 'Saída'];

export function IntentionWizard({ initialData, onSave, onClose }: IntentionWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [triggerInput, setTriggerInput] = useState("");
  const [headerKey, setHeaderKey] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [activeWebhookTab, setActiveWebhookTab] = useState<'headers' | 'body'>('body');

  const [form, setForm] = useState<IntentionFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    triggers: initialData?.triggers || [],
    webhook: initialData?.webhook || { url: '', method: 'POST', headers: {}, body: '{\n  \n}' },
    persistVariables: initialData?.persistVariables || false,
    responseType: initialData?.responseType || 'ai_interpretation',
    fixedResponse: initialData?.fixedResponse || '',
  });

  const addTrigger = () => {
    if (triggerInput.trim() && !form.triggers.includes(triggerInput.trim())) {
      setForm(prev => ({ ...prev, triggers: [...prev.triggers, triggerInput.trim()] }));
      setTriggerInput("");
    }
  };

  const removeTrigger = (t: string) => {
    setForm(prev => ({ ...prev, triggers: prev.triggers.filter(x => x !== t) }));
  };

  const addHeader = () => {
    if (headerKey.trim()) {
      setForm(prev => ({
        ...prev,
        webhook: { ...prev.webhook, headers: { ...prev.webhook.headers, [headerKey]: headerValue } }
      }));
      setHeaderKey("");
      setHeaderValue("");
    }
  };

  const removeHeader = (key: string) => {
    setForm(prev => {
      const h = { ...prev.webhook.headers };
      delete h[key];
      return { ...prev, webhook: { ...prev.webhook, headers: h } };
    });
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
          {/* STEP 1: Details */}
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
                <label className="text-sm font-medium text-foreground">Frases Gatilho</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    placeholder="Adicione um gatilho e pressione Enter"
                    value={triggerInput}
                    onChange={(e) => setTriggerInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTrigger())}
                  />
                  <Button variant="outline" onClick={addTrigger}>Adicionar</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.triggers.map(t => (
                    <Badge key={t} variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => removeTrigger(t)}>
                      "{t}" <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Webhook */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">URL do Webhook</label>
                <div className="flex gap-2">
                  <select
                    className="bg-background border border-border rounded-lg px-3 py-3 text-sm font-mono font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground w-24"
                    value={form.webhook.method}
                    onChange={(e) => setForm(prev => ({ ...prev, webhook: { ...prev.webhook, method: e.target.value as any } }))}
                  >
                    <option>POST</option>
                    <option>GET</option>
                    <option>PUT</option>
                    <option>DELETE</option>
                  </select>
                  <input
                    className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    placeholder="https://api.exemplo.com/webhook"
                    value={form.webhook.url}
                    onChange={(e) => setForm(prev => ({ ...prev, webhook: { ...prev.webhook, url: e.target.value } }))}
                  />
                </div>
              </div>

              {/* Tabs: Headers / Body */}
              <div className="space-y-3">
                <div className="flex gap-1 border-b border-border">
                  {(['headers', 'body'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveWebhookTab(tab)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeWebhookTab === tab
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab === 'headers' ? 'Headers' : 'Body (JSON)'}
                    </button>
                  ))}
                </div>

                {activeWebhookTab === 'headers' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        placeholder="Content-Type"
                        value={headerKey}
                        onChange={(e) => setHeaderKey(e.target.value)}
                      />
                      <input
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                        placeholder="application/json"
                        value={headerValue}
                        onChange={(e) => setHeaderValue(e.target.value)}
                      />
                      <Button variant="outline" size="sm" onClick={addHeader}>+</Button>
                    </div>
                    {Object.entries(form.webhook.headers).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs font-mono bg-muted/50 px-3 py-2 rounded-lg">
                        <span className="text-foreground font-semibold">{k}:</span>
                        <span className="text-muted-foreground flex-1">{v}</span>
                        <button onClick={() => removeHeader(k)} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {activeWebhookTab === 'body' && (
                  <textarea
                    className="w-full min-h-[160px] bg-background border border-border rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    placeholder='{"whatsappName": "{{contact_name}}", "phone": "{{contact_phone}}"}'
                    value={form.webhook.body}
                    onChange={(e) => setForm(prev => ({ ...prev, webhook: { ...prev.webhook, body: e.target.value } }))}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: <code className="bg-muted px-1 rounded font-mono">{'{{contact_name}}'}</code>, <code className="bg-muted px-1 rounded font-mono">{'{{contact_phone}}'}</code>, <code className="bg-muted px-1 rounded font-mono">{'{{message}}'}</code>
              </p>
            </>
          )}

          {/* STEP 3: Output */}
          {step === 2 && (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-border rounded-xl bg-background">
                  <div>
                    <p className="text-sm font-medium text-foreground">Persistir variáveis no contato</p>
                    <p className="text-xs text-muted-foreground">Salvar dados extraídos (nome, telefone) no perfil do lead.</p>
                  </div>
                  <button
                    onClick={() => setForm(prev => ({ ...prev, persistVariables: !prev.persistVariables }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.persistVariables ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.persistVariables ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Tipo de Resposta do Agente</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setForm(prev => ({ ...prev, responseType: 'ai_interpretation' }))}
                      className={`p-4 border rounded-xl text-left transition-colors ${
                        form.responseType === 'ai_interpretation'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <Code className="w-5 h-5 mb-2 text-primary" />
                      <p className="text-sm font-medium text-foreground">Interpretação da API</p>
                      <p className="text-xs text-muted-foreground mt-1">O agente interpreta a resposta da API e formula a mensagem.</p>
                    </button>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, responseType: 'fixed_text' }))}
                      className={`p-4 border rounded-xl text-left transition-colors ${
                        form.responseType === 'fixed_text'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <ToggleLeft className="w-5 h-5 mb-2 text-primary" />
                      <p className="text-sm font-medium text-foreground">Texto Fixo</p>
                      <p className="text-xs text-muted-foreground mt-1">O agente envia uma resposta pré-definida.</p>
                    </button>
                  </div>
                </div>

                {form.responseType === 'fixed_text' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Mensagem fixa</label>
                    <textarea
                      className="w-full min-h-[100px] bg-background border border-border rounded-lg p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                      placeholder="Sua reunião foi agendada com sucesso! Em breve entraremos em contato."
                      value={form.fixedResponse}
                      onChange={(e) => setForm(prev => ({ ...prev, fixedResponse: e.target.value }))}
                    />
                  </div>
                )}
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
