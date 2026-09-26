// ============================================================================
// Sprint 11 · Onda 4 · T44 — the answer of an artifact action (contract v1).
//
// Public (verify_jwt = false): the one-time token in the body is the only key.
// The n8n posts { token, status?, fields?, files?, error?, keep_open?, event_id? }
// after generating a proposal or sending a contract. In order:
//   1. claim the run with the token (the database checks hash, use, expiry);
//   2. an `event_id` already applied in this run → 200 duplicate, nothing again;
//   3. check the body against what the record accepts — before any download;
//   4. download each file (https, public host, 25 MB) into the private bucket;
//   5. apply everything in one transaction (fields, files, status → milestone).
// A bad body or a failed download releases the claim, so the automation can
// retry with the same token; what went up to the bucket comes down.
//
// SE-DOCPIPE-001: `event_id` (idempotency of keep_open answers) and a keep_open
// answer renews the token (30 days, at most 90 from the click).
//
// Contract: Planning/Architecture/contrato_artefato_v1.md and
// docs/dev/projects/saas-salesengine-v1.0/SE-DOCPIPE-001/claude/integracao-n8n.md
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  checkAgainstClaim,
  errorCode,
  httpStatusFor,
  parseCallbackBody,
  removeArtifactFiles,
  storeArtifactFiles,
  type CallbackClaim,
  type UploadedFile,
} from "../_shared/artifact-callback.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

if (import.meta.main) {
  serve(async (req) => {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const parsed = parseCallbackBody(await req.json().catch(() => null));
    if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
    const body = parsed.body;

    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. The token.
    const { data: claimData, error: claimError } = await db.rpc("_crm_artifact_callback_claim", { p_token: body.token });
    if (claimError) {
      return json({ ok: false, error: errorCode(claimError.message) }, httpStatusFor(claimError.message));
    }
    const claim = claimData as CallbackClaim;
    const release = (reason: string) =>
      db.rpc("_crm_artifact_callback_release", { p_run_id: claim.run_id, p_error: reason });

    // 2. The same event again: answered already.
    if (body.eventId) {
      const { data: seen, error: seenError } = await db.rpc("_crm_artifact_callback_seen", {
        p_run_id: claim.run_id,
        p_event_id: body.eventId,
      });
      if (seenError) {
        await release(seenError.message);
        console.error("[artifact-callback]", seenError.message);
        return json({ ok: false, error: "internal_error" }, 500);
      }
      if (seen === true) return json({ ok: true, run_id: claim.run_id, status: "duplicate", event_id: body.eventId });
    }

    // 3. The body against the record, before downloading anything.
    const problem = checkAgainstClaim(body, claim);
    if (problem) {
      await release(problem);
      return json({ ok: false, error: problem }, 422);
    }

    // 4. The files, into the private bucket.
    let uploaded: UploadedFile[] = [];
    if (!body.error) {
      try {
        uploaded = await storeArtifactFiles(db, body.files, claim);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        await release(reason);
        return json({ ok: false, error: "file_download_failed", detail: reason.slice(0, 200) }, 422);
      }
    }

    // 5. Everything at once.
    const { data: result, error: finishError } = await db.rpc("_crm_artifact_callback_apply", {
      p_run_id: claim.run_id,
      p_status: body.error ? null : body.status,
      p_fields: body.error ? {} : body.fields,
      p_files: uploaded,
      p_error: body.error,
      p_keep_open: body.error ? false : body.keepOpen,
      p_event_id: body.eventId,
    });
    if (finishError) {
      await removeArtifactFiles(db, uploaded);
      await release(finishError.message);
      console.error("[artifact-callback]", finishError.message);
      return json({ ok: false, error: errorCode(finishError.message) }, httpStatusFor(finishError.message));
    }

    const answer = result as Record<string, unknown>;
    // Raced past the early check (it only happens under a concurrent claim
    // timeout): the database kept the first; the files of this one come down.
    if (answer?.status === "duplicate") await removeArtifactFiles(db, uploaded);
    return json({ ok: true, run_id: claim.run_id, ...answer });
  });
}
