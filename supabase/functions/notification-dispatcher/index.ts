// ============================================================================
// Sprint 8 · T8 — notification dispatcher.
//
// notify() (T4) only ENQUEUES: it writes the notification and one
// notification_deliveries row per channel. This drains that queue.
//
// Invoked two ways:
//   - by the cron every minute, as a safety net;
//   - directly after a critical event, so a confirmed payment does not wait a
//     minute to be acknowledged.
//
// PRINCIPLE: a failure on one channel must never cost the others. The in-app
// copy is the durable record; email and WhatsApp are alerts on top of it.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/asaas.ts";
import { sendViaSolo } from "../_shared/solo-sender.ts";
import { renderEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 3;
/** Backoff per attempt number, in minutes. */
const BACKOFF_MIN = [1, 5, 30];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("BILLING_CRON_SECRET");
  if (!secret) return json({ error: "not_configured" }, 500);
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { limit } = await req.json().catch(() => ({ limit: 100 })) as { limit?: number };

  const { data: pending, error } = await db
    .from("notification_deliveries")
    .select(`
      id, channel, attempts, status,
      notifications!inner (
        id, equipe_id, user_id, type, severity, title, body, action_url, created_at,
        proposal_id, recipient_phone, recipient_email
      )
    `)
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit ?? 100);

  if (error) return json({ error: error.message }, 500);

  // Sprint 8.4: routing is read once per run, not per delivery. There are four
  // senders and a handful of types; re-reading them for every message would turn
  // a 100-message drain into 300 round trips.
  const routing = await loadRouting(db);

  const result = { sent: 0, failed: 0, skipped: 0, deferred: 0 };

  for (const row of pending ?? []) {
    const d = row as unknown as Delivery;

    // Respect the backoff window instead of hammering a provider that is down.
    if (d.status === "failed" && d.attempts > 0) {
      const wait = BACKOFF_MIN[Math.min(d.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000;
      const since = Date.now() - new Date(d.notifications.created_at).getTime();
      if (since < wait) { result.deferred++; continue; }
    }

    try {
      const outcome = await deliver(db, d, routing);
      await db.from("notification_deliveries").update({
        status: outcome.status,
        provider_id: outcome.providerId ?? null,
        sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
        attempts: d.attempts + 1,
        last_error: outcome.error ?? null,
      }).eq("id", d.id);

      if (outcome.status === "sent") result.sent++;
      else if (outcome.status === "skipped") result.skipped++;
      else result.failed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("notification_deliveries").update({
        status: "failed", attempts: d.attempts + 1, last_error: message,
      }).eq("id", d.id);
      result.failed++;
      console.error(`[dispatcher] ${d.channel} delivery ${d.id} failed:`, message);
    }
  }

  return json({ ok: true, ...result });
});

interface Delivery {
  id: string;
  channel: "in_app" | "email" | "whatsapp";
  attempts: number;
  status: string;
  notifications: {
    id: string;
    /** NULL when the recipient is not a tenant — a proposal recipient. */
    equipe_id: string | null;
    user_id: string | null; type: string;
    severity: string; title: string; body: string | null; action_url: string | null;
    created_at: string;
    proposal_id: string | null;
    /** Set by the per-client policy, or by the proposal itself. Wins over
        anything derived from the team. */
    recipient_phone: string | null;
    recipient_email: string | null;
  };
}

interface Sender {
  purpose: string;
  whatsapp_instance: string | null;
  email_from: string | null;
  active: boolean;
}

/** Senders by purpose, purpose by notification type, and platform settings. */
interface Routing {
  senders: Map<string, Sender>;
  purposeOf: Map<string, string>;
  settings: Map<string, string>;
}

async function loadRouting(db: SupabaseClient): Promise<Routing> {
  const [{ data: senders }, { data: types }, { data: settings }] = await Promise.all([
    db.from("notification_senders").select("purpose, whatsapp_instance, email_from, active"),
    db.from("notification_types").select("type, purpose"),
    db.from("system_settings").select("key, value"),
  ]);

  return {
    senders: new Map((senders ?? []).map((s) => [s.purpose as string, s as Sender])),
    purposeOf: new Map((types ?? []).map((t) => [t.type as string, t.purpose as string])),
    settings: new Map(
      (settings ?? [])
        .filter((s) => s.value)
        .map((s) => [s.key as string, s.value as string]),
    ),
  };
}

/**
 * The sender for a message, or null when that purpose is switched off.
 *
 * A missing sender row is not the same as an inactive one: missing means nobody
 * configured this purpose yet and the platform default should carry the message,
 * whereas `active = false` is a deliberate "stop sending as this voice".
 */
function senderFor(r: Routing, type: string): Sender | null {
  const purpose = r.purposeOf.get(type) ?? "operacao";
  const sender = r.senders.get(purpose);
  if (sender && !sender.active) return null;
  return sender ?? null;
}

interface Outcome { status: "sent" | "failed" | "skipped"; providerId?: string; error?: string }

async function deliver(db: SupabaseClient, d: Delivery, r: Routing): Promise<Outcome> {
  switch (d.channel) {
    // The row IS the delivery — the UI reads the notifications table directly.
    case "in_app":
      return { status: "sent" };
    case "email":
      return await deliverEmail(db, d, r);
    case "whatsapp":
      return await deliverWhatsApp(db, d, r);
    default:
      return { status: "skipped", error: `unknown channel ${d.channel}` };
  }
}

async function deliverEmail(db: SupabaseClient, d: Delivery, r: Routing): Promise<Outcome> {
  // Sprint 8.4: the panel's value wins so the key can be rotated without a
  // redeploy; the env var stays the fallback so clearing the row cannot take
  // e-mail down.
  const apiKey = r.settings.get("RESEND_API_KEY") ?? Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { status: "skipped", error: "RESEND_API_KEY not configured" };

  const recipients = await recipientEmails(db, d);
  if (!recipients.length) return { status: "skipped", error: "no recipient email" };

  const sender = senderFor(r, d.notifications.type);
  const brand = await brandFor(db, d.notifications.equipe_id);
  const { subject, html } = renderEmail({
    title: d.notifications.title,
    body: d.notifications.body ?? "",
    actionUrl: absoluteUrl(d.notifications.action_url, brand.appUrl),
    severity: d.notifications.severity,
    brandName: brand.name,
    brandColor: brand.color,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    // The purpose's address when one is set — its domain must be verified at
    // Resend, which is why the brand address remains the fallback.
    body: JSON.stringify({
      from: sender?.email_from ?? r.settings.get("NOTIFICATION_FROM_EMAIL") ?? brand.from,
      to: recipients,
      subject,
      html,
    }),
  });

  if (!res.ok) return { status: "failed", error: `resend ${res.status}: ${await res.text()}` };
  const body = await res.json().catch(() => ({}));
  return { status: "sent", providerId: (body as { id?: string }).id };
}

/**
 * WhatsApp goes out through a PLATFORM-owned instance, never the tenant's own.
 * The tenant's number is their commercial channel; mixing our billing alerts
 * into it confuses their customers and risks the number they depend on.
 *
 * Sprint 8.4: WHICH platform instance now depends on who is speaking. A payment
 * reminder leaves from Financeiro, a proposal from Comercial — so the client can
 * tell them apart, and so can we when they reply.
 *
 * The old severity gate is gone. It hardcoded "warn and above" for every tenant
 * alike, which made the per-type and per-client switchboard unreachable: a type
 * could declare whatsapp and still never send. What may go out is now decided by
 * notify(), from the type's channels narrowed by the client's policy.
 */
async function deliverWhatsApp(db: SupabaseClient, d: Delivery, r: Routing): Promise<Outcome> {
  const sender = senderFor(r, d.notifications.type);
  if (sender === null && r.senders.has(r.purposeOf.get(d.notifications.type) ?? "operacao")) {
    return { status: "skipped", error: "sender for this purpose is inactive" };
  }
  const instance = sender?.whatsapp_instance ?? Deno.env.get("SOLO_PLATFORM_INSTANCE_ID");
  if (!instance) {
    return { status: "skipped", error: "no whatsapp instance configured for this purpose" };
  }

  const phones = await recipientPhones(db, d);
  if (!phones.length) return { status: "skipped", error: "no recipient phone" };

  const brand = await brandFor(db, d.notifications.equipe_id);
  const text = [
    `*${d.notifications.title}*`,
    d.notifications.body ?? "",
    d.notifications.action_url ? absoluteUrl(d.notifications.action_url, brand.appUrl) : "",
  ].filter(Boolean).join("\n\n");

  let lastError = "";
  let providerId: string | undefined;
  let anySent = false;
  for (const phone of phones) {
    const r = await sendViaSolo({
      supabase: db,
      equipeId: d.notifications.equipe_id,
      instanceName: instance,
      phone,
      content: text,
    });
    if (r.ok) { anySent = true; providerId = r.providerMessageId ?? providerId; }
    else lastError = r.error ?? "unknown";
  }

  return anySent ? { status: "sent", providerId } : { status: "failed", error: lastError };
}

/** Targeted at one person, or every admin/owner of the team. */
async function recipientEmails(db: SupabaseClient, d: Delivery): Promise<string[]> {
  const n = d.notifications;

  // Sprint 8.4 — an explicit address settles it: either the founder pointed this
  // client's mail somewhere specific, or there is no team to derive it from
  // because the recipient is a proposal recipient.
  if (n.recipient_email) return [n.recipient_email];
  if (!n.equipe_id) return [];

  if (n.user_id) {
    const { data } = await db.from("profiles").select("email").eq("user_id", n.user_id).maybeSingle();
    return data?.email ? [data.email] : [];
  }

  const { data: account } = await db
    .from("billing_accounts").select("billing_email").eq("equipe_id", n.equipe_id).maybeSingle();

  const { data: admins } = await db
    .from("profiles").select("email, role, cargo").eq("equipe_id", n.equipe_id);

  const set = new Set<string>();
  if (account?.billing_email) set.add(account.billing_email);
  for (const p of admins ?? []) {
    if (["owner", "admin", "super_admin"].includes(p.role ?? "") || p.cargo === "owner") {
      if (p.email) set.add(p.email);
    }
  }
  // Founder-facing types also copy the platform address.
  const founder = Deno.env.get("PLATFORM_FOUNDER_EMAIL");
  if (founder && n.type.startsWith("proposal.")) set.add(founder);
  return [...set];
}

async function recipientPhones(db: SupabaseClient, d: Delivery): Promise<string[]> {
  const n = d.notifications;
  const set = new Set<string>();

  // Same rule as e-mail: an explicit number is the answer, and a message to a
  // proposal recipient has no team to fall back to.
  if (n.recipient_phone) {
    const only = digits(n.recipient_phone);
    return only.length >= 10 ? [only] : [];
  }
  if (!n.equipe_id) return [];

  const { data: account } = await db
    .from("billing_accounts").select("phone").eq("equipe_id", n.equipe_id).maybeSingle();
  if (account?.phone) set.add(digits(account.phone));

  if (!set.size) {
    const { data: admins } = await db
      .from("profiles").select("telefone, role, cargo").eq("equipe_id", n.equipe_id);
    for (const p of admins ?? []) {
      if (p.telefone && (["owner", "admin"].includes(p.role ?? "") || p.cargo === "owner")) {
        set.add(digits(p.telefone));
      }
    }
  }

  const founderPhone = Deno.env.get("PLATFORM_FOUNDER_PHONE");
  if (founderPhone && (n.type.startsWith("proposal.") || n.severity === "critical")) {
    set.add(digits(founderPhone));
  }
  return [...set].filter((p) => p.length >= 10);
}

interface Brand { name: string; color: string; from: string; appUrl: string }

/** The one address every notification is sent from. Its domain must be verified. */
function senderAddress(): string {
  return Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "no-reply@soloventures.com.br";
}

/** White-label per niche, so the email is not a generic gateway notice. */
async function brandFor(db: SupabaseClient, equipeId: string | null): Promise<Brand> {
  const fallback: Brand = {
    name: Deno.env.get("PLATFORM_NAME") ?? "Sales Engine",
    color: "#2563eb",
    from: `${Deno.env.get("PLATFORM_NAME") ?? "Sales Engine"} <${senderAddress()}>`,
    appUrl: Deno.env.get("APP_BASE_URL") ?? "",
  };

  // A proposal recipient has no team, so there is no niche to white-label with:
  // they hear from the platform itself, which is correct — they are not a
  // customer of any niche yet.
  if (!equipeId) return fallback;

  const { data: equipe } = await db.from("equipes").select("niche").eq("id", equipeId).maybeSingle();
  if (!equipe?.niche) return fallback;

  const { data: niche } = await db
    .from("niches").select("nome, domain, primary_color").eq("id", equipe.niche).maybeSingle();
  if (!niche) return fallback;

  // WHITE-LABEL THE NAME, NOT THE SENDING DOMAIN.
  //
  // This used to build `no-reply@<niche.domain>` — solon.soloventures.com.br,
  // bmg.soloventures.com.br and so on. Production rejected every one of them:
  // "domain is not verified". Those are APP domains; an email sender domain has
  // to be verified with the provider first, and verifying one per niche does not
  // scale as niches are added.
  //
  // So the address stays on a single verified domain and the NICHE becomes the
  // display name. The recipient still reads "Solon" in their inbox, and there is
  // exactly one DNS setup to maintain.
  return {
    name: niche.nome ?? fallback.name,
    color: niche.primary_color ?? fallback.color,
    from: `${(niche.nome ?? fallback.name).replace(/[<>"]/g, "")} <${senderAddress()}>`,
    appUrl: niche.domain ? `https://${niche.domain}` : fallback.appUrl,
  };
}

const digits = (s: string) => s.replace(/\D/g, "");
const absoluteUrl = (path: string | null, base: string) =>
  !path ? "" : /^https?:\/\//.test(path) ? path : `${base}${path}`;
