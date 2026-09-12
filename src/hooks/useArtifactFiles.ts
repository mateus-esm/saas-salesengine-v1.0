// Sprint 11 · Onda 4 · T42 — files of the artifacts, in the private bucket.
//
// Upload under the team's folder (the Storage policy checks it), open by a signed
// link that lives one minute, remove the object. The value of the field (the
// list of files) is saved by whoever holds the record.

import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  ARTIFACT_BUCKET,
  ARTIFACT_MAX_BYTES,
  artifactFilePath,
  type ArtifactFile,
} from "@/lib/artifactFiles";

export interface ArtifactFileTarget {
  equipeId: string;
  tableId: string;
  recordId: string;
}

const SIGNED_URL_SECONDS = 60;

export function useArtifactFiles() {
  return useMemo(
    () => ({
      async upload(target: ArtifactFileTarget, file: File): Promise<ArtifactFile> {
        if (file.size > ARTIFACT_MAX_BYTES) throw new Error(`"${file.name}" passa de 25 MB.`);
        const path = artifactFilePath(target.equipeId, target.tableId, target.recordId, file.name);
        const { error } = await supabase.storage
          .from(ARTIFACT_BUCKET)
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw error;
        return {
          path,
          name: file.name,
          size: file.size,
          type: file.type || null,
          uploaded_at: new Date().toISOString(),
        };
      },

      /**
       * Opens the file in a new tab. The tab is opened before the link is asked
       * for: a window opened after an await is blocked as a popup.
       */
      async open(file: ArtifactFile): Promise<void> {
        if (!file.path && file.url) {
          window.open(file.url, "_blank", "noopener,noreferrer");
          return;
        }
        const tab = window.open("", "_blank");
        if (tab) tab.opener = null;
        const { data, error } = await supabase.storage
          .from(ARTIFACT_BUCKET)
          .createSignedUrl(file.path, SIGNED_URL_SECONDS);
        if (error || !data?.signedUrl) {
          tab?.close();
          throw error ?? new Error("Não foi possível abrir o arquivo.");
        }
        if (tab) tab.location.href = data.signedUrl;
        else window.location.assign(data.signedUrl);
      },

      async remove(files: ArtifactFile[]): Promise<void> {
        const paths = files.map((f) => f.path).filter(Boolean);
        if (paths.length === 0) return;
        const { error } = await supabase.storage.from(ARTIFACT_BUCKET).remove(paths);
        if (error) throw error;
      },
    }),
    [],
  );
}
