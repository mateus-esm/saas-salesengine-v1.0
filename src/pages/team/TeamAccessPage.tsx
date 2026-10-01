/**
 * SE-TEAMACCESS-001 — "Equipe": o dono adiciona pessoas, muda o papel e
 * restringe o acesso, até o limite de usuários do plano.
 *
 * A tela só reflete; quem decide (papel, equipe, limite) é a edge function
 * `team-access` e o trigger de assentos. Esconder um botão aqui não é controle.
 */
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Copy, Loader2, ShieldOff, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/hooks/useRole";
import { useTeamAccess, type TeamAccessMember } from "@/hooks/useTeamAccess";

const ROLE_LABEL: Record<string, string> = {
  user: "Usuário",
  admin: "Administrador",
  owner: "Dono",
  super_admin: "Super admin",
};

function tempPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Nunca entrou";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TeamAccessPage() {
  const { hasRole, loadingRole } = useRole();
  const isOwner = hasRole("owner");
  const { overview, isLoading, error, run, isMutating } = useTeamAccess(isOwner);

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [password, setPassword] = useState("");
  const [confirmRestrict, setConfirmRestrict] = useState<TeamAccessMember | null>(null);

  if (loadingRole) {
    return <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }
  if (!isOwner) return <Navigate to="/home" replace />;

  const seats = overview?.seats;
  const atLimit = seats ? !seats.can_add : false;
  const pct = seats?.limit ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0;

  const openAdd = () => {
    setEmail("");
    setName("");
    setRole("user");
    setPassword(tempPassword());
    setAddOpen(true);
  };

  const guard = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir");
    }
  };

  const handleAdd = () =>
    guard(async () => {
      await run({ action: "add", email, password, full_name: name || undefined, role });
      const pw = password;
      setAddOpen(false);
      toast.success(`${email} adicionado. Senha temporária: ${pw}`, {
        duration: 20000,
        action: { label: "Copiar", onClick: () => navigator.clipboard.writeText(pw) },
      });
    }, "Usuário criado");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            Quem tem acesso ao seu ambiente e com qual papel. Restringir bloqueia o login e libera o assento, sem apagar o histórico da pessoa.
          </p>
        </div>
        <Button onClick={openAdd} disabled={atLimit || isLoading}>
          <UserPlus className="mr-2 h-4 w-4" /> Adicionar usuário
        </Button>
      </div>

      {seats && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-medium">Usuários ativos</span>
            <span className="font-mono-data">
              {seats.used}{seats.limit != null ? ` / ${seats.limit}` : ""}
            </span>
          </div>
          {seats.limit != null && <Progress value={pct} />}
          {atLimit && (
            <p className="mt-2 text-sm text-amber-600">
              Você atingiu o limite do plano. Restrinja alguém para liberar um assento ou faça upgrade em Billing → Plano.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">Não foi possível carregar a equipe: {error.message}</p>}

      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overview?.members ?? []).map((m) => {
                const locked = m.is_me || m.role === "owner" || m.role === "super_admin";
                const restricted = m.access_status === "restricted";
                return (
                  <TableRow key={m.user_id} className={restricted ? "opacity-60" : undefined}>
                    <TableCell>
                      <div className="font-medium">{m.nome_completo}{m.is_me && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      {locked ? (
                        <Badge variant="outline">{ROLE_LABEL[m.role]}</Badge>
                      ) : (
                        <Select
                          value={m.role}
                          disabled={isMutating || restricted}
                          onValueChange={(v) =>
                            guard(() => run({ action: "set_role", user_id: m.user_id, role: v as "user" | "admin" }), "Papel atualizado")
                          }
                        >
                          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Usuário</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={restricted ? "secondary" : "default"}>{restricted ? "Restrito" : "Ativo"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatLastSeen(m.last_sign_in_at)}</TableCell>
                    <TableCell className="text-right">
                      {!locked && (restricted ? (
                        <Button
                          size="sm" variant="outline" disabled={isMutating || atLimit}
                          title={atLimit ? "Sem assento livre no plano" : undefined}
                          onClick={() => guard(() => run({ action: "set_access", user_id: m.user_id, access: "active" }), "Acesso restabelecido")}
                        >
                          <ShieldCheck className="mr-1 h-4 w-4" /> Reativar
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={isMutating} onClick={() => setConfirmRestrict(m)}>
                          <ShieldOff className="mr-1 h-4 w-4" /> Restringir
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar usuário</DialogTitle>
            <DialogDescription>
              Crie o acesso e passe a senha temporária à pessoa por um canal seguro. Ela não é exibida de novo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ta-name">Nome</Label>
              <Input id="ta-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ta-email">E-mail</Label>
              <Input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "user" | "admin")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário — CRM, chat e dashboard</SelectItem>
                  <SelectItem value="admin">Administrador — também configurações</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ta-pw">Senha temporária</Label>
              <div className="flex gap-2">
                <Input id="ta-pw" value={password} readOnly className="font-mono-data" />
                <Button type="button" variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(password)} aria-label="Copiar senha">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={isMutating || !email.includes("@")}>
              {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmRestrict} onOpenChange={(o) => !o && setConfirmRestrict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restringir {confirmRestrict?.nome_completo}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa não consegue mais entrar e o assento é liberado. Leads, notas e histórico continuam intactos, e você pode reativar depois se houver assento livre. Uma sessão já aberta pode seguir válida por até uma hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmRestrict;
                setConfirmRestrict(null);
                if (target) guard(() => run({ action: "set_access", user_id: target.user_id, access: "restricted" }), "Acesso restringido");
              }}
            >
              Restringir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
