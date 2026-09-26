// ============================================================================
// SE-DOCPIPE-001 — the inbound door of the document pipeline.
//
// verify_jwt = false: authenticated by the tenant (x-webhook-secret or
// ?secret=, the same secret of crm-webhook; or the service role with
// equipe_id), like start-conversation and outreach.
//
//   action "update" (default) — update an artifact record BY ID (or by a field,
//     e.g. clicksign_document_id), outside a click: status, fields and files,
//     with the same rules as the callback. Idempotent by `event_id`: the same
//     event twice is applied once (200 duplicate).
//   action "file_url" — a signed URL (5 minutes) of a file of the tenant's
//     artifacts, e.g. the proposal PDF the Contract Engine merges. Also accepts
//     the callback `token` of a run still open instead of the secret.
//
// Contract: docs/dev/projects/saas-salesengine-v1.0/SE-DOCPIPE-001/claude/integracao-n8n.md
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  ARTIFACT_BUCKET,
  checkAgainstClaim,
  removeArtifactFiles,
  storeArtifactFiles,
  type CallbackClaim,
  type UploadedFile,
} from "../_shared/artifact-callback.ts";
import { inboundError, isTenantArtifactPath, parseInboundRequest } from "../_shared/artifact-inbound.ts";
import { HttpError, resolveCaller } from "../_shared/tenant-auth.ts";

const SIGNED_URL_SECONDS = 300;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type InboundClaim = Omit<CallbackClaim, "run_id"> & { duplicate: false; event_row_id: string };
type InboundDuplicate = { duplicate: true; record_id: string | null; result: Record<string, unknown> | null };

if (import.meta.main) {
  serve(async (req) => {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const raw = await req.json().catch(() => null);
    const parsed = parseInboundRequest(raw);
    if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
    const input = parsed.req;

    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Who is calling: the token of an open run (file_url only), else the tenant.
    let equipeId: string;
    try {
      if (input.action === "file_url" && input.token) {
        const { data, error } = await db.rpc("_crm_artifact_run_equipe", { p_token: input.token });
        if (error) throw error;
        if (!data) return json({ ok: false, error: "token_invalid" }, 401);
        equipeId = data as string;
      } else {
        equipeId = (await resolveCaller(req, new URL(req.url), db, raw as Record<string, unknown>)).equipeId;
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.code }, e.status);
      console.error("[artifact-inbound] auth", e instanceof Error ? e.message : e);
      return json({ ok: false, error: "internal_error" }, 500);
    }

    // ---- file_url ---------------------------------------------------------
    if (input.action === "file_url") {
      if (!isTenantArtifactPath(input.path, equipeId)) return json({ ok: false, error: "path_not_allowed" }, 403);
      const { data, error } = await db.storage.from(ARTIFACT_BUCKET).createSignedUrl(input.path, SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) return json({ ok: false, error: "file_not_found" }, 404);
      return json({ ok: true, url: data.signedUrl, expires_in: SIGNED_URL_SECONDS });
    }

    // ---- update -----------------------------------------------------------
    // 1. The event and the record.
    const { data: beginData, error: beginError } = await db.rpc("_crm_artifact_inbound_begin", {
      p_equipe: equipeId,
      p_event_id: input.eventId,
      p_record_id: input.recordId,
      p_table_id: input.match?.tableId ?? null,
      p_match_key: input.match?.key ?? null,
      p_match_value: input.match?.value ?? null,
    });
    if (beginError) {
      const answer = inboundError(beginError.message);
      if (answer.status === 500) console.error("[artifact-inbound] begin", beginError.message);
      return json({ ok: false, ...answer }, answer.status);
    }
    const begun = beginData as InboundClaim | InboundDuplicate;
    if (begun.duplicate) {
      return json({ ok: true, duplicate: true, event_id: input.eventId, record_id: begun.record_id, ...(begun.result ?? {}) });
    }
    const claim = begun;
    const release = (reason: string) =>
      db.rpc("_crm_artifact_inbound_release", { p_event_row_id: claim.event_row_id, p_error: reason });

    // 2. The body against the record, before downloading anything.
    const problem = checkAgainstClaim({ status: input.status, files: input.files, error: null }, claim);
    if (problem) {
      await release(problem);
      return json({ ok: false, error: problem }, 422);
    }

    // 3. The files, into the private bucket.
    let uploaded: UploadedFile[] = [];
    try {
      uploaded = await storeArtifactFiles(db, input.files, claim);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await release(reason);
      return json({ ok: false, error: "file_download_failed", detail: reason.slice(0, 200) }, 422);
    }

    // 4. Everything at once.
    const { data: result, error: finishError } = await db.rpc("_crm_artifact_inbound_finish", {
      p_event_row_id: claim.event_row_id,
      p_status: input.status,
      p_fields: input.fields,
      p_files: uploaded,
    });
    if (finishError) {
      await removeArtifactFiles(db, uploaded);
      await release(finishError.message);
      const answer = inboundError(finishError.message);
      if (answer.status === 500) console.error("[artifact-inbound] finish", finishError.message);
      return json({ ok: false, ...answer }, answer.status);
    }

    return json({
      ok: true,
      duplicate: false,
      event_id: input.eventId,
      record_id: claim.record_id,
      ...(result as Record<string, unknown>),
    });
  });
}
