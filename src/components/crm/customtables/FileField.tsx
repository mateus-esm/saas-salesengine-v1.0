import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useArtifactFiles, type ArtifactFileTarget } from "@/hooks/useArtifactFiles";
import { filesOf, formatBytes, type ArtifactFile } from "@/lib/artifactFiles";

interface FileFieldProps {
  label: string;
  value: unknown;
  /** Saves the new list; the field waits for it (and undoes an upload it could not save). */
  onChange: (next: ArtifactFile[]) => Promise<unknown>;
  target: ArtifactFileTarget;
  disabled?: boolean;
}

/**
 * Sprint 11 · Onda 4 · T42 — a file column in the record's drawer: the files
 * (open by a one-minute signed link), attach one or many, remove. Each change is
 * saved at once — an uploaded file that is not in the record is a file nobody
 * finds again.
 */
export function FileField({ label, value, onChange, target, disabled = false }: FileFieldProps) {
  const files = filesOf(value);
  const storage = useArtifactFiles();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setBusy(true);
    const uploaded: ArtifactFile[] = [];
    try {
      for (const file of Array.from(picked)) uploaded.push(await storage.upload(target, file));
      await onChange([...files, ...uploaded]);
    } catch (e) {
      // Nothing half-saved: what went up without being recorded comes down.
      await storage.remove(uploaded).catch(() => {});
      toast.error("Não foi possível anexar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (file: ArtifactFile) => {
    setBusy(true);
    try {
      await onChange(files.filter((f) => f !== file));
      await storage.remove([file]).catch(() => {});
    } catch (e) {
      toast.error("Não foi possível remover: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = (file: ArtifactFile) =>
    storage.open(file).catch((e: unknown) =>
      toast.error("Não foi possível abrir: " + (e instanceof Error ? e.message : String(e))),
    );

  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, i) => (
            <li
              key={file.path || file.url || i}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-primary hover:underline"
                onClick={() => void handleOpen(file)}
              >
                {file.name}
              </button>
              {file.size !== null && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => void handleRemove(file)}
                disabled={disabled || busy}
                aria-label={`Remover ${file.name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handlePick(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
        Anexar arquivo
      </Button>
    </div>
  );
}
