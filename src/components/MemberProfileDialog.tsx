import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ContactProfile = {
  nome_completo: string | null;
  telefone: string | null;
  contact_email?: string | null;
  photo?: string | null;
  email: string | null;
};
async function thumbnail(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  }
  const src = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível ler a foto.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 192, 192);
    ctx.drawImage(
      image,
      (image.width - size) / 2,
      (image.height - size) / 2,
      size,
      size,
      0,
      0,
      192,
      192,
    );
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function MemberProfileDialog(
  { member, userId, close }: {
    member: ContactProfile;
    userId: string;
    close: () => void;
  },
) {
  const { user, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [original] = useState(() => ({
    nome_completo: member.nome_completo,
    telefone: member.telefone,
    contact_email: member.contact_email ?? null,
    photo: member.photo ?? null,
  }));
  const [name, setName] = useState(original.nome_completo ?? "");
  const [phone, setPhone] = useState(original.telefone ?? "");
  const [email, setEmail] = useState(
    original.contact_email ?? member.email ?? "",
  );
  const [photo, setPhoto] = useState(original.photo);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const values = {
        nome_completo: name.trim(),
        telefone: phone.trim() || null,
        contact_email: email.trim() === member.email
          ? null
          : email.trim() || null,
        photo,
      };
      const changes = Object.fromEntries(
        (Object.keys(values) as (keyof typeof values)[]).filter((k) =>
          values[k] !== original[k]
        ).map((k) => [k, values[k]]),
      );
      if (Object.keys(changes).length) {
        const { error } = await (supabase as any).rpc("edit_member_profile", {
          member_id: userId,
          changes,
          original,
        });
        if (error) throw new Error(error.message);
      }
      toast.success("Perfil salvo");
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["team_access"] });
      void qc.invalidateQueries({ queryKey: ["team_members"] });
      if (user?.id === userId) void refreshProfile();
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">
              Nome<Input
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              E-mail de contato<Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              E-mail de acesso · {member.email}
            </p>
            <label className="block">
              Telefone / WhatsApp<Input
                type="tel"
                placeholder="+55 85 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            {photo && (
              <div className="flex items-center gap-2">
                <img
                  src={photo}
                  alt="Foto do perfil"
                  className="size-14 rounded-full"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPhoto(null)}
                >
                  Remover foto
                </Button>
              </div>
            )}
            <label className="block">
              Foto<Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    setPhoto(await thumbnail(file));
                  } catch {
                    toast.error(
                      "Não foi possível abrir a foto. Escolha JPG, PNG ou WebP.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <Button type="submit">Salvar perfil</Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
