// ============================================================================
// Sprint 8.2 — a cobrança no gateway, num lugar só.
//
// POR QUE FOI EXTRAÍDO: `ensureCharges` morava dentro de provision-tenant. O
// go-live precisa exatamente do mesmo comportamento idempotente — criar o
// cliente no Asaas se não existir, cobrar cada fatura que ainda não tem
// pagamento — e duplicar isso significaria duas versões da regra que decide se
// o cliente é cobrado.
//
// O QUE MUDOU NA EXTRAÇÃO: a versão antiga lançava
// `new Error("billing_account_incomplete — cobranças não emitidas")`, e quem
// chamava engolia como warning genérico. O provisionamento reportava sucesso,
// e só semanas depois alguém percebia que a fatura nunca virou cobrança. Foi
// exatamente o que aconteceu com a Rema Digital: FAT-2026-000018, R$700,
// aberta, sem asaas_payment_id.
//
// Agora `checkBillingReadiness` devolve O QUE falta, tipado, para que a
// interface peça o campo certo ANTES de colocar o cliente no ar.
//
// ARQUITETURA: o Asaas é o trilho do pagamento, nunca a fonte da verdade. Nada
// aqui decide se um cliente tem acesso — isso vem de contracts e invoices.
// ============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCustomer, createPaymentPreferCard } from "./asaas.ts";
import { isValidBrDoc, isPlausibleEmail } from "./br-doc.ts";

/** O que impede uma cobrança de existir. Nomes que a interface traduz em campos. */
export type BillingGap = "doc" | "email";

export interface BillingReadiness {
  ok: boolean;
  missing: BillingGap[];
  account: {
    doc_number: string | null;
    billing_email: string | null;
    legal_name: string | null;
    phone?: string | null;
    asaas_customer_id?: string | null;
    /** Sprint 8.2 — cartão salvo, quando o cliente optou por cobrança automática. */
    asaas_card_token?: string | null;
    autopay_enabled?: boolean | null;
  } | null;
}

/**
 * A conta de cobrança desta equipe consegue gerar uma cobrança?
 *
 * Chamado ANTES do go-live, não depois. Descobrir que falta o CNPJ no momento
 * em que o cliente já foi avisado de que está no ar é o pior momento possível.
 */
export async function checkBillingReadiness(
  db: SupabaseClient,
  equipeId: string,
): Promise<BillingReadiness> {
  const { data: account } = await db
    .from("billing_accounts")
    .select("doc_number, billing_email, legal_name, phone, asaas_customer_id, asaas_card_token, autopay_enabled")
    .eq("equipe_id", equipeId)
    .maybeSingle();

  const missing: BillingGap[] = [];
  // Documento inválido conta como ausente: o gateway vai recusá-lo do mesmo
  // jeito, e "presente porém inválido" é uma distinção que não ajuda ninguém.
  if (!isValidBrDoc(account?.doc_number ?? "")) missing.push("doc");
  if (!isPlausibleEmail(account?.billing_email ?? "")) missing.push("email");

  return { ok: missing.length === 0, missing, account: account ?? null };
}

/**
 * A data de vencimento que a cobrança deve realmente levar.
 *
 * A fatura de implantação nasce vencendo na data prevista de conclusão. Quando
 * a implantação atrasa, essa data já passou no momento do go-live — e emitir um
 * boleto nascido vencido entrega ao cliente uma cobrança em atraso no mesmo dia
 * em que o produto ficou pronto. Três dias é o mínimo para conseguir pagar.
 */
export function chargeDueDate(preferred: string | null, today = new Date()): string {
  const floor = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 3,
  ));
  const wanted = preferred ? new Date(`${preferred}T00:00:00Z`) : floor;
  const chosen = wanted.getTime() > floor.getTime() ? wanted : floor;
  return chosen.toISOString().slice(0, 10);
}

export interface ChargeResult {
  charged: string[];
  skipped: string[];
  customer_id: string | null;
  /** Faturas cujo cartão salvo recusou e viraram boleto/PIX. */
  card_failures: string[];
}

/**
 * Garante o cliente no gateway e uma cobrança por fatura que ainda não tem.
 *
 * Idempotente em dois níveis: um `asaas_customer_id` já gravado não cria um
 * segundo cliente, e uma fatura que já tem `asaas_payment_id` é pulada. É o que
 * permite reexecutar um provisionamento pela metade sem cobrar duas vezes.
 */
export async function ensureCharges(
  db: SupabaseClient,
  input: { equipe_id: string; invoice_ids: (string | null)[]; due_date?: string | null },
): Promise<ChargeResult> {
  const ready = await checkBillingReadiness(db, input.equipe_id);
  if (!ready.ok || !ready.account) {
    throw new BillingIncompleteError(ready.missing);
  }

  let customerId = ready.account.asaas_customer_id ?? null;
  if (!customerId) {
    const customer = await createCustomer({
      name: ready.account.legal_name ?? "Cliente",
      email: ready.account.billing_email ?? undefined,
      cpfCnpj: ready.account.doc_number!,
      phone: ready.account.phone ?? undefined,
    });
    customerId = customer.id;
    await db.from("billing_accounts")
      .update({ asaas_customer_id: customerId })
      .eq("equipe_id", input.equipe_id);
  }

  const charged: string[] = [];
  const skipped: string[] = [];
  const cardFailures: string[] = [];

  for (const invoiceId of input.invoice_ids) {
    if (!invoiceId) continue;

    const { data: inv } = await db
      .from("invoices")
      .select("id, number, total, kind, due_date, asaas_payment_id, status, metadata")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!inv) continue;
    // Já cobrada, ou anulada: nos dois casos não se cobra de novo.
    if (inv.asaas_payment_id || inv.status === "void") {
      skipped.push(invoiceId);
      continue;
    }

    const due = chargeDueDate(input.due_date ?? inv.due_date ?? null);

    // Sprint 8.2 — cobra no cartão salvo quando o cliente pediu isso, e cai
    // para boleto/PIX se o cartão recusar. Um cartão recusado não pode virar
    // "sem forma de pagar": a fatura ficaria aberta sem cobrança e o cliente
    // entraria em atraso por um problema que ninguém contou a ele.
    const useCard = ready.account.autopay_enabled !== false
      ? ready.account.asaas_card_token ?? null
      : null;

    const { payment, usedCard, cardError } = await createPaymentPreferCard({
      customer: customerId!,
      billingType: "UNDEFINED",
      value: Number(inv.total),
      dueDate: due,
      description: `${inv.kind === "setup" ? "Implantação" : "Assinatura"} — fatura ${inv.number}`,
      externalReference: `invoice_${inv.id}`,
      creditCardToken: useCard,
    });

    if (cardError) cardFailures.push(inv.number ?? invoiceId);

    await db.from("invoices").update({
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl ?? null,
      due_date: due,
      // Registra COMO foi cobrada. Sem isto, "por que este cliente recebeu
      // boleto se tem cartão salvo?" não tem resposta no banco.
      metadata: { ...(inv.metadata ?? {}), charged_via: usedCard ? "card" : "invoice" },
    }).eq("id", inv.id);

    charged.push(invoiceId);
  }

  return { charged, skipped, customer_id: customerId, card_failures: cardFailures };
}

/** Carrega O QUE falta, para que quem chamou consiga pedir o campo certo. */
export class BillingIncompleteError extends Error {
  readonly missing: BillingGap[];
  constructor(missing: BillingGap[]) {
    super(`billing_incomplete:${missing.join(",")}`);
    this.name = "BillingIncompleteError";
    this.missing = missing;
  }
}
