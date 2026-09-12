// ============================================================================
// Sprint 11 · Onda 4 · T44 — the answer of an artifact action (contract v1).
//
// Public (verify_jwt = false): the one-time token in the body is the only key.
// The n8n posts { token, status?, fields?, files?, error?, keep_open? } after generating a
// proposal or sending a contract. In order:
//   1. claim the run with the token (the database checks hash, use, expiry);
//   2. check the body against what the record accepts — before any download;
//   3. download each file (https, public host, 25 MB) into the private bucket;
//   4. apply everything in one transaction (fields, files, status → milestone).
// A bad body or a failed download releases the claim, so the automation can
// retry with the same token; what went up to the bucket comes down.
//
// Contract: Planning/Architecture/contrato_artefato_v1.md
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  ARTIFACT_BUCKET,
  ARTIFACT_MAX_BYTES,
  artifactFilePath,
  checkAgainstClaim,
  errorCode,
  fileNameFrom,
  httpStatusFor,
  isSafeDownloadUrl,
  parseCallbackBody,
  resolveFileField,
  type CallbackClaim,
} from "../_shared/artifact-callback.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface UploadedFile {
  field_id: string;
  path: string;
  name: string;
  size: number;
  type: string | null;
}

// Redirects are followed by hand (file hosts hand out signed links), each hop
// checked like the first: a redirect must not lead into a private network.
async function download(url: string): Promise<{ bytes: Uint8Array; type: string | null; disposition: string | null }> {
  let current = url;
  let res: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    if (!isSafeDownloadUrl(current)) throw new Error("unsafe_file_url");
    res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).toString();
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new Error("too_many_redirects");
  if (!res.ok) throw new Error(`download_failed:${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > ARTIFACT_MAX_BYTES) throw new Error("file_too_large");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > ARTIFACT_MAX_BYTES) throw new Error("file_too_large");
  return { bytes, type: res.headers.get("content-type"), disposition: res.headers.get("content-disposition") };
}

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

    // 2. The body against the record, before downloading anything.
    const problem = checkAgainstClaim(body, claim);
    if (problem) {
      await release(problem);
      return json({ ok: false, error: problem }, 422);
    }

    // 3. The files, into the private bucket.
    const uploaded: UploadedFile[] = [];
    if (!body.error) {
      try {
        for (const file of body.files) {
          const fieldId = resolveFileField(file, claim)!;
          const { bytes, type, disposition } = await download(file.url);
          const name = fileNameFrom(file.url, disposition, type, file.name);
          const path = artifactFilePath(claim.equipe_id, claim.table_id, claim.record_id, name);
          const contentType = type?.split(";")[0].trim() || undefined;
          const { error } = await db.storage.from(ARTIFACT_BUCKET).upload(path, bytes, { contentType, upsert: false });
          if (error) throw new Error(`upload_failed:${error.message}`);
          uploaded.push({ field_id: fieldId, path, name, size: bytes.byteLength, type: contentType ?? null });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        if (uploaded.length) await db.storage.from(ARTIFACT_BUCKET).remove(uploaded.map((u) => u.path));
        await release(reason);
        return json({ ok: false, error: "file_download_failed", detail: reason.slice(0, 200) }, 422);
      }
    }

    // 4. Everything at once.
    const { data: result, error: finishError } = await db.rpc("_crm_artifact_callback_finish", {
      p_run_id: claim.run_id,
      p_status: body.error ? null : body.status,
      p_fields: body.error ? {} : body.fields,
      p_files: uploaded,
      p_error: body.error,
      p_keep_open: body.error ? false : body.keepOpen,
    });
    if (finishError) {
      if (uploaded.length) await db.storage.from(ARTIFACT_BUCKET).remove(uploaded.map((u) => u.path));
      await release(finishError.message);
      console.error("[artifact-callback]", finishError.message);
      return json({ ok: false, error: errorCode(finishError.message) }, httpStatusFor(finishError.message));
    }

    return json({ ok: true, run_id: claim.run_id, ...(result as Record<string, unknown>) });
  });
}
