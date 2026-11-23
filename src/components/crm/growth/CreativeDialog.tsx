import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CREATIVE_FORMATS, normalizeCreativeCode, type Creative } from "@/lib/growth";

const SELECT = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

type Draft = { id?: string; code: string; title: string; format: string | null; delivered_on: string | null; files_url: string | null; notes: string | null; status: "active" | "archived" };

const toDraft = (c: Creative | null): Draft => ({
  ...(c ? { id: c.id } : {}),
  code: c?.code ?? "",
  title: c?.title ?? "",
  format: c?.format ?? null,
  delivered_on: c?.delivered_on ?? null,
  files_url: c?.files_url ?? null,
  notes: c?.notes ?? null,
  status: c?.status ?? "active",
});

/** Sprint 16 — a creative from the studio: the code (P002-V3) is what sums everything it generated. */
export function CreativeDialog({
  open,
  creative,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  creative: Creative | null;
  saving: boolean;
  onClose: () => void;
  onSave: (d: Draft) => Promise<unknown>;
}) {
  const [d, setD] = useState<Draft>(toDraft(creative));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setD(toDraft(creative));
      setErr(null);
    }
  }, [open, creative]);

  const submit = async () => {
    const code = normalizeCreativeCode(d.code);
    if (!code) return setErr("Dê um código ao criativo (até 60 caracteres; recomendado P000-V0, ex.: P002-V3).");
    try {
      await onSave({ ...d, code });
      onClose();
    } catch {
      /* toast already shown */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {creative?.thumbnail_url && (
          <img src={creative.thumbnail_url} alt="" className="h-32 w-full rounded-md object-cover" referrerPolicy="no-referrer" />
        )}
        <DialogHeader>
          <DialogTitle>{creative ? `Criativo ${creative.code}` : "Novo criativo"}</DialogTitle>
          <DialogDescription>
            Recomendado: código P000-V0 no começo do nome do anúncio (e do utm_content). Sem código, o Windsor junta os
            anúncios pelo vídeo e usa o nome do anúncio.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Código</Label>
            <Input value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} placeholder="P002-V3" className="uppercase" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Formato</Label>
            <select className={SELECT} value={d.format ?? ""} onChange={(e) => setD({ ...d, format: e.target.value || null })}>
              <option value="">—</option>
              {CREATIVE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Peça</Label>
            <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Carmona ponta a ponta" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entregue em</Label>
            <Input type="date" value={d.delivered_on ?? ""} onChange={(e) => setD({ ...d, delivered_on: e.target.value || null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <select className={SELECT} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Draft["status"] })}>
              <option value="active">Ativo</option>
              <option value="archived">Arquivado</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Link dos arquivos</Label>
            <Input value={d.files_url ?? ""} onChange={(e) => setD({ ...d, files_url: e.target.value || null })} placeholder="https://drive.google.com/…" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value || null })} />
          </div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
