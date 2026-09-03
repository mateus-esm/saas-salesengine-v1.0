import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBillingAccount, useEquipeId } from "@/hooks/useBilling";
import { isValidCPF, isValidCNPJ, maskDoc, onlyDigits } from "@/lib/br-doc";

/**
 * Sprint 8 T13 — the paying entity.
 *
 * The document is validated by check digit here, not just by length. Asaas
 * rejects an invalid one at charge time, which is the worst possible moment to
 * find out: the customer has already decided to pay.
 */
export default function BillingDataPage() {
  const equipeId = useEquipeId();
  const { data: account, refetch, isLoading } = useBillingAccount();
  const { toast } = useToast();

  const [docType, setDocType] = useState<"CPF" | "CNPJ">("CNPJ");
  const [form, setForm] = useState({
    doc_number: "", legal_name: "", billing_email: "", phone: "",
    postal_code: "", address_street: "", address_number: "",
    address_complement: "", address_district: "", address_city: "", address_state: "",
  });
  const [saving, setSaving] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    setDocType((account.doc_type as "CPF" | "CNPJ") ?? "CNPJ");
    setForm({
      doc_number: maskDoc(account.doc_number ?? "", (account.doc_type as "CPF" | "CNPJ") ?? "CNPJ"),
      legal_name: account.legal_name ?? "",
      billing_email: account.billing_email ?? "",
      phone: account.phone ?? "",
      postal_code: account.postal_code ?? "",
      address_street: account.address_street ?? "",
      address_number: account.address_number ?? "",
      address_complement: account.address_complement ?? "",
      address_district: account.address_district ?? "",
      address_city: account.address_city ?? "",
      address_state: account.address_state ?? "",
    });
  }, [account]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /** Fill the address from the CEP so the customer types less. Silent on failure. */
  const lookupCep = async () => {
    const cep = onlyDigits(form.postal_code);
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data?.erro) return;
      setForm((f) => ({
        ...f,
        address_street: data.logradouro || f.address_street,
        address_district: data.bairro || f.address_district,
        address_city: data.localidade || f.address_city,
        address_state: data.uf || f.address_state,
      }));
    } catch { /* leave the fields for manual entry */ }
  };

  const save = async () => {
    const digits = onlyDigits(form.doc_number);
    const valid = docType === "CPF" ? isValidCPF(digits) : isValidCNPJ(digits);
    if (!valid) {
      setDocError(`${docType} inválido. Confira os números.`);
      return;
    }
    setDocError(null);
    if (!equipeId) return;

    setSaving(true);
    try {
      // Sprint 8.2 — a gravação vai por uma função, não por um upsert daqui.
      //
      // `billing_accounts` tem RLS com UMA política, de SELECT. O upsert direto
      // que estava aqui falhava de dois jeitos: sem a linha, o INSERT batia no
      // RLS e voltava 42501; com a linha, o UPDATE não casava com política
      // nenhuma, afetava ZERO linhas e o PostgREST devolvia 200 — o cliente lia
      // "Dados de cobrança salvos" e nada tinha sido salvo.
      //
      // A função é SECURITY DEFINER e aceita só os campos que o cliente pode
      // mudar: `asaas_customer_id` e `asaas_card_token` não têm parâmetro, então
      // não há como apontá-los para a conta de outra pessoa.
      const { error } = await supabase.rpc("save_billing_account", {
        p_doc_type: docType,
        p_doc_number: digits,
        p_legal_name: form.legal_name || null,
        p_billing_email: form.billing_email || null,
        p_phone: form.phone || null,
        p_postal_code: form.postal_code || null,
        p_address_street: form.address_street || null,
        p_address_number: form.address_number || null,
        p_address_complement: form.address_complement || null,
        p_address_district: form.address_district || null,
        p_address_city: form.address_city || null,
        p_address_state: form.address_state || null,
      });
      if (error) throw error;
      await refetch();
      toast({ title: "Dados de cobrança salvos" });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dados de cobrança</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Usados para emitir suas faturas. Precisam estar completos antes de qualquer cobrança.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
          <CardDescription>Quem é o responsável financeiro pela conta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={docType}
            onValueChange={(v) => { setDocType(v as "CPF" | "CNPJ"); setDocError(null); }}
            className="flex gap-5"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="CNPJ" id="d-cnpj" />
              <Label htmlFor="d-cnpj" className="cursor-pointer text-sm">Empresa (CNPJ)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="CPF" id="d-cpf" />
              <Label htmlFor="d-cpf" className="cursor-pointer text-sm">Pessoa física (CPF)</Label>
            </div>
          </RadioGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc" className="text-xs">{docType}</Label>
              <Input
                id="doc"
                value={form.doc_number}
                onChange={(e) => setForm((f) => ({ ...f, doc_number: maskDoc(e.target.value, docType) }))}
                placeholder={docType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                aria-invalid={!!docError}
              />
              {docError && <p className="text-xs text-destructive">{docError}</p>}
            </div>
            <Text label={docType === "CPF" ? "Nome completo" : "Razão social"} value={form.legal_name} onChange={set("legal_name")} />
            <Text label="E-mail de cobrança" value={form.billing_email} onChange={set("billing_email")} type="email" />
            <Text label="Telefone" value={form.phone} onChange={set("phone")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cep" className="text-xs">CEP</Label>
            <Input id="cep" value={form.postal_code} onChange={set("postal_code")} onBlur={lookupCep} placeholder="00000-000" />
          </div>
          <Text label="Rua" value={form.address_street} onChange={set("address_street")} />
          <Text label="Número" value={form.address_number} onChange={set("address_number")} />
          <Text label="Complemento" value={form.address_complement} onChange={set("address_complement")} />
          <Text label="Bairro" value={form.address_district} onChange={set("address_district")} />
          <Text label="Cidade" value={form.address_city} onChange={set("address_city")} />
          <Text label="Estado" value={form.address_state} onChange={set("address_state")} />
        </CardContent>
      </Card>

      <PaymentMethodCard account={account} onChanged={refetch} />

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || isLoading}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Salvar dados
        </Button>
      </div>
    </div>
  );
}

/**
 * Sprint 8.2 — o cartão salvo e a cobrança automática.
 *
 * POR QUE NÃO EXISTE UM FORMULÁRIO DE CARTÃO AQUI: o número do cartão nunca
 * passa por este app. O cliente digita no checkout do próprio Asaas ao pagar
 * uma fatura, e o que volta para nós é um token — uma referência opaca que só
 * serve para cobrar esta conta. Guardar o número aqui traria PCI para dentro de
 * um produto que não precisa dele.
 *
 * Então o cartão não é "cadastrado": ele é APRENDIDO na primeira fatura paga no
 * cartão. Esta tela mostra o que foi aprendido e deixa o cliente desligar ou
 * remover.
 */
function PaymentMethodCard({
  account, onChanged,
}: {
  account: { asaas_card_token?: string | null; card_last4?: string | null;
             card_brand?: string | null; autopay_enabled?: boolean | null } | null | undefined;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const hasCard = !!account?.asaas_card_token;
  const enabled = account?.autopay_enabled !== false;

  const apply = async (nextEnabled: boolean, forget = false) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_autopay", {
        p_enabled: nextEnabled,
        p_forget_card: forget,
      });
      if (error) throw error;
      toast({
        title: forget
          ? "Cartão removido"
          : nextEnabled ? "Cobrança automática ligada" : "Cobrança automática desligada",
        description: forget || !nextEnabled
          ? "As próximas faturas virão por boleto ou PIX."
          : "A mensalidade do dia 1 será cobrada no cartão.",
      });
      onChanged();
    } catch (e) {
      toast({
        title: "Não foi possível alterar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Forma de pagamento</CardTitle>
        <CardDescription>
          A assinatura é cobrada todo dia 1. Com um cartão salvo, isso acontece sozinho.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCard ? (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">
                  {account?.card_brand ?? "Cartão"}
                  {account?.card_last4 ? ` · final ${account.card_last4}` : ""}
                </span>
              </div>
              <Button
                variant="ghost" size="sm" disabled={busy}
                className="text-destructive hover:text-destructive"
                onClick={() => apply(false, true)}
              >
                Remover
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="autopay" className="text-sm cursor-pointer">
                  Cobrança automática
                </Label>
                <p className="text-xs text-muted-foreground">
                  {enabled
                    ? "A fatura do dia 1 é debitada no cartão. Você continua recebendo o recibo."
                    : "Desligada. Você recebe boleto ou PIX para pagar."}
                </p>
              </div>
              <Switch
                id="autopay" checked={enabled} disabled={busy}
                onCheckedChange={(v) => apply(v)}
              />
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nenhum cartão salvo. Ao pagar a próxima fatura <strong>com cartão</strong>, ele
                fica guardado com segurança no Asaas e as cobranças seguintes passam a ser
                automáticas — sem você precisar lembrar do dia 1.
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Text({ label, value, onChange, type = "text" }: {
  label: string; value: string; type?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} />
    </div>
  );
}
