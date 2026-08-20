// ============================================================================
// Sprint 8 · T5 — shared Asaas client.
//
// The customer create/update block and the payment-creation block were
// duplicated verbatim between asaas-subscribe and asaas-buy-credits. Both are
// being reworked in T6, so the calls live here once.
//
// ARCHITECTURE: Asaas is the payment RAIL, never the source of truth. Nothing in
// this file decides whether a tenant has access — that comes from our contracts
// and invoices. These functions only move money and report what the gateway said.
// ============================================================================

const ASAAS_API_URL = "https://api.asaas.com/v3";

export type BillingType = "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED";

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  externalReference?: string;
}

export interface AsaasPixQr {
  encodedImage?: string;
  payload?: string;
}

/** Every Asaas webhook body we care about. */
export interface AsaasWebhookEvent {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: {
    id: string;
    status?: string;
    value?: number;
    netValue?: number;
    externalReference?: string;
    customer?: string;
    billingType?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

function apiKey(): string {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("ASAAS_API_KEY not configured");
  return key;
}

function headers(): HeadersInit {
  return { "Content-Type": "application/json", access_token: apiKey() };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ASAAS_API_URL}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asaas ${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

export async function createCustomer(input: {
  name: string;
  email?: string | null;
  cpfCnpj: string;
  phone?: string | null;
}): Promise<AsaasCustomer> {
  return await call<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email ?? undefined,
      cpfCnpj: input.cpfCnpj,
      phone: input.phone ?? undefined,
      notificationDisabled: false,
    }),
  });
}

export async function updateCustomer(
  customerId: string,
  input: { cpfCnpj?: string; name?: string; email?: string | null },
): Promise<AsaasCustomer> {
  return await call<AsaasCustomer>(`/customers/${customerId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function createPayment(input: {
  customer: string;
  billingType: BillingType;
  value: number;
  dueDate: string; // YYYY-MM-DD
  description: string;
  externalReference: string;
}): Promise<AsaasPayment> {
  return await call<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQr> {
  try {
    return await call<AsaasPixQr>(`/payments/${paymentId}/pixQrCode`);
  } catch (_e) {
    // A missing QR code must not fail the charge: the invoice link still works.
    return {};
  }
}

/** YYYY-MM-DD, `days` from today. */
export function dueDateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Constant-time string comparison for the webhook token.
 *
 * A plain `a === b` leaks the token one character at a time through response
 * timing. The cost here is nil and the endpoint is public.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Which of our invoice statuses an Asaas event implies.
 * Returns null for events we deliberately ignore.
 */
export function mapEventToInvoiceStatus(event: string): "paid" | "overdue" | "refunded" | "void" | "open" | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "paid";
    case "PAYMENT_OVERDUE":
      return "overdue";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
      return "refunded";
    case "PAYMENT_DELETED":
      return "void";
    case "PAYMENT_RESTORED":
      return "open";
    default:
      return null;
  }
}
