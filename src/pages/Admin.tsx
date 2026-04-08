import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Building2, Users, Edit, Coins, Shield, Loader2, Plus, Trash2,
  RefreshCw, UserCog, Globe, LayoutGrid, Key, Webhook, Home,
  CreditCard, Bot, ChevronRight, UserMinus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Niche {
  id: string;
  nome: string;
  domain: string;
  description: string | null;
  primary_color: string | null;
  custom_fields: any[];
  active: boolean;
  created_at: string;
}

interface Equipe {
  id: string;
  nome: string;
  niche: string | null;
  gpt_maker_agent_id: string | null;
  workspace_id: string | null;
  limite_creditos: number;
  creditos_avulsos: number;
  webhook_secret: string | null;
  home_explanation: string | null;
  crm_link: string | null;
  suporte_link: string | null;
  subscription_status: string | null;
  is_crm_agent_enabled: boolean;
  plano_id: number | null;
  created_at: string;
}

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  nome_completo: string | null;
  equipe_id: string | null;
  cargo: string | null;
}

interface ProfileWithRole extends Profile {
  role: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: "user" | "admin" | "owner" | "super_admin";
}

const ROLES = ["user", "admin", "owner", "super_admin"] as const;

const roleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
  if (role === "super_admin") return "default";
  if (role === "owner") return "destructive";
  if (role === "admin") return "secondary";
  return "outline";
};

const statusBadgeVariant = (status: string | null): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "ACTIVE") return "default";
  if (status === "OVERDUE") return "destructive";
  return "secondary";
};

// ─── Main Component ────────────────────────────────────────────────────────────

const Admin = () => {
  const navigate = useNavigate();
  const { role, isSuperAdmin, loadingRole } = useRole();

  // ── Data state
  const [niches, setNiches] = useState<Niche[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithRole[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Niche dialog state
  const [nicheDialog, setNicheDialog] = useState(false);
  const [editingNiche, setEditingNiche] = useState<Partial<Niche> | null>(null);
  const [isNewNiche, setIsNewNiche] = useState(false);
  const [deleteNicheTarget, setDeleteNicheTarget] = useState<Niche | null>(null);

  // ── Equipe dialog state
  const [equipeDialog, setEquipeDialog] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState<Partial<Equipe> | null>(null);
  const [isNewEquipe, setIsNewEquipe] = useState(false);
  const [deleteEquipeTarget, setDeleteEquipeTarget] = useState<Equipe | null>(null);

  // ── Credits dialog state
  const [creditsDialog, setCreditsDialog] = useState(false);
  const [creditsEquipe, setCreditsEquipe] = useState<Equipe | null>(null);
  const [creditsToAdd, setCreditsToAdd] = useState("");

  // ── Members sheet state
  const [membersSheet, setMembersSheet] = useState(false);
  const [membersEquipe, setMembersEquipe] = useState<Equipe | null>(null);
  const [equipeMembers, setEquipeMembers] = useState<ProfileWithRole[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── User dialog state
  const [userDialog, setUserDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileWithRole | null>(null);

  // ─── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadingRole) return;
    if (role !== "super_admin") navigate("/home");
  }, [loadingRole, role, navigate]);

  // ─── Fetch all data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [nichesRes, equipesRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("niches" as any).select("*").order("nome"),
        supabase.from("equipes").select("*").order("nome"),
        supabase.from("profiles").select("id, user_id, email, nome_completo, equipe_id, cargo").order("email"),
        supabase.from("user_roles").select("*"),
      ]);

      if (nichesRes.data) setNiches(nichesRes.data as Niche[]);
      if (equipesRes.data) setEquipes(equipesRes.data as Equipe[]);

      const roles = (rolesRes.data || []) as UserRole[];
      setUserRoles(roles);

      if (profilesRes.data) {
        const merged = profilesRes.data.map((p) => ({
          ...(p as Profile),
          role: roles.find((r) => r.user_id === p.user_id)?.role || "user",
        })) as ProfileWithRole[];
        setProfiles(merged);
      }
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadingRole || role !== "super_admin") {
      if (!loadingRole) setLoading(false);
      return;
    }
    fetchData();
  }, [loadingRole, role, fetchData]);

  // ─── Niche handlers ──────────────────────────────────────────────────────────

  const openCreateNiche = () => {
    setEditingNiche({ id: "", nome: "", domain: "", description: "", primary_color: "28 100% 50%", active: true, custom_fields: [] });
    setIsNewNiche(true);
    setNicheDialog(true);
  };

  const openEditNiche = (n: Niche) => {
    setEditingNiche({ ...n });
    setIsNewNiche(false);
    setNicheDialog(true);
  };

  const handleSaveNiche = async () => {
    if (!editingNiche?.id || !editingNiche.nome || !editingNiche.domain) {
      toast.error("ID, nome e domínio são obrigatórios");
      return;
    }
    try {
      if (isNewNiche) {
        const { error } = await supabase.from("niches" as any).insert({
          id: editingNiche.id.toLowerCase().replace(/\s+/g, "_"),
          nome: editingNiche.nome,
          domain: editingNiche.domain,
          description: editingNiche.description || null,
          primary_color: editingNiche.primary_color || "28 100% 50%",
          custom_fields: editingNiche.custom_fields || [],
          active: editingNiche.active ?? true,
        });
        if (error) throw error;
        toast.success("Nicho criado!");
      } else {
        const { error } = await supabase
          .from("niches" as any)
          .update({
            nome: editingNiche.nome,
            domain: editingNiche.domain,
            description: editingNiche.description || null,
            primary_color: editingNiche.primary_color || "28 100% 50%",
            active: editingNiche.active ?? true,
          })
          .eq("id", editingNiche.id);
        if (error) throw error;
        toast.success("Nicho atualizado!");
      }
      setNicheDialog(false);
      setEditingNiche(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar nicho");
    }
  };

  const handleDeleteNiche = async () => {
    if (!deleteNicheTarget) return;
    try {
      const { error } = await supabase.from("niches" as any).delete().eq("id", deleteNicheTarget.id);
      if (error) throw error;
      toast.success("Nicho removido");
      setDeleteNicheTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover nicho");
    }
  };

  // ─── Equipe handlers ─────────────────────────────────────────────────────────

  const openCreateEquipe = () => {
    setEditingEquipe({
      nome: "", niche: "", gpt_maker_agent_id: "", workspace_id: "",
      home_explanation: "", crm_link: "", suporte_link: "",
      webhook_secret: "", limite_creditos: 1000, creditos_avulsos: 0,
      is_crm_agent_enabled: false,
    });
    setIsNewEquipe(true);
    setEquipeDialog(true);
  };

  const openEditEquipe = (e: Equipe) => {
    setEditingEquipe({ ...e });
    setIsNewEquipe(false);
    setEquipeDialog(true);
  };

  const handleSaveEquipe = async () => {
    if (!editingEquipe?.nome) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      if (isNewEquipe) {
        const { error } = await supabase.from("equipes").insert({
          nome: editingEquipe.nome,
          niche: editingEquipe.niche || null,
          gpt_maker_agent_id: editingEquipe.gpt_maker_agent_id || null,
          workspace_id: editingEquipe.workspace_id || null,
          home_explanation: editingEquipe.home_explanation || null,
          crm_link: editingEquipe.crm_link || "",
          suporte_link: editingEquipe.suporte_link || "",
          webhook_secret: editingEquipe.webhook_secret || undefined,
          limite_creditos: editingEquipe.limite_creditos ?? 1000,
          is_crm_agent_enabled: editingEquipe.is_crm_agent_enabled ?? false,
        } as any);
        if (error) throw error;
        toast.success("Equipe criada!");
      } else {
        const { error } = await supabase
          .from("equipes")
          .update({
            nome: editingEquipe.nome,
            niche: editingEquipe.niche || null,
            gpt_maker_agent_id: editingEquipe.gpt_maker_agent_id || null,
            workspace_id: editingEquipe.workspace_id || null,
            home_explanation: editingEquipe.home_explanation || null,
            crm_link: editingEquipe.crm_link || "",
            suporte_link: editingEquipe.suporte_link || "",
            webhook_secret: editingEquipe.webhook_secret || null,
            limite_creditos: editingEquipe.limite_creditos ?? 1000,
            is_crm_agent_enabled: editingEquipe.is_crm_agent_enabled ?? false,
          } as any)
          .eq("id", editingEquipe.id!);
        if (error) throw error;
        toast.success("Equipe atualizada!");
      }
      setEquipeDialog(false);
      setEditingEquipe(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar equipe");
    }
  };

  const handleDeleteEquipe = async () => {
    if (!deleteEquipeTarget) return;
    try {
      const { error } = await supabase.from("equipes").delete().eq("id", deleteEquipeTarget.id);
      if (error) throw error;
      toast.success("Equipe removida");
      setDeleteEquipeTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover equipe");
    }
  };

  const handleRegenerateSecret = () => {
    const newSecret = crypto.randomUUID();
    setEditingEquipe((prev) => prev ? { ...prev, webhook_secret: newSecret } : prev);
  };

  const handleAddCredits = async () => {
    if (!creditsEquipe || !creditsToAdd) return;
    try {
      const newTotal = creditsEquipe.creditos_avulsos + parseInt(creditsToAdd);
      const { error } = await supabase.from("equipes").update({ creditos_avulsos: newTotal } as any).eq("id", creditsEquipe.id);
      if (error) throw error;
      setEquipes((prev) => prev.map((e) => e.id === creditsEquipe.id ? { ...e, creditos_avulsos: newTotal } : e));
      toast.success(`${creditsToAdd} créditos adicionados!`);
      setCreditsDialog(false);
      setCreditsEquipe(null);
      setCreditsToAdd("");
    } catch {
      toast.error("Erro ao adicionar créditos");
    }
  };

  // ─── Members handlers ────────────────────────────────────────────────────────

  const openMembersSheet = async (equipe: Equipe) => {
    setMembersEquipe(equipe);
    setMembersSheet(true);
    setLoadingMembers(true);
    try {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, user_id, email, nome_completo, equipe_id, cargo")
        .eq("equipe_id", equipe.id);

      if (profilesData) {
        const merged = profilesData.map((p) => ({
          ...(p as Profile),
          role: userRoles.find((r) => r.user_id === p.user_id)?.role || "user",
        })) as ProfileWithRole[];
        setEquipeMembers(merged);
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleUpdateMemberRole = async (member: ProfileWithRole, newRole: string) => {
    try {
      const existing = userRoles.find((r) => r.user_id === member.user_id);
      if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", member.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: member.user_id, role: newRole as any });
        if (error) throw error;
      }
      setUserRoles((prev) =>
        existing
          ? prev.map((r) => r.user_id === member.user_id ? { ...r, role: newRole as any } : r)
          : [...prev, { id: crypto.randomUUID(), user_id: member.user_id, role: newRole as any }]
      );
      setEquipeMembers((prev) => prev.map((m) => m.user_id === member.user_id ? { ...m, role: newRole } : m));
      toast.success("Role atualizada!");
    } catch {
      toast.error("Erro ao atualizar role");
    }
  };

  const handleRemoveMember = async (member: ProfileWithRole) => {
    try {
      const { error } = await supabase.from("profiles").update({ equipe_id: null } as any).eq("user_id", member.user_id);
      if (error) throw error;
      setEquipeMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      setProfiles((prev) => prev.map((p) => p.user_id === member.user_id ? { ...p, equipe_id: null } : p));
      toast.success(`${member.email} removido da equipe`);
    } catch {
      toast.error("Erro ao remover membro");
    }
  };

  // ─── User handlers ───────────────────────────────────────────────────────────

  const handleUpdateProfile = async () => {
    if (!editingProfile) return;
    try {
      // Update role
      const existing = userRoles.find((r) => r.user_id === editingProfile.user_id);
      if (existing) {
        await supabase.from("user_roles").update({ role: editingProfile.role as any }).eq("user_id", editingProfile.user_id);
      } else {
        await supabase.from("user_roles").insert({ user_id: editingProfile.user_id, role: editingProfile.role as any });
      }
      // Update equipe assignment
      await supabase.from("profiles").update({ equipe_id: editingProfile.equipe_id || null } as any).eq("user_id", editingProfile.user_id);

      setProfiles((prev) => prev.map((p) => p.id === editingProfile.id ? editingProfile : p));
      setUserDialog(false);
      setEditingProfile(null);
      toast.success("Usuário atualizado!");
    } catch {
      toast.error("Erro ao atualizar usuário");
    }
  };

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading || loadingRole) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerenciamento completo de nichos, equipes e usuários
          </p>
        </div>
      </div>

      <Tabs defaultValue="nichos">
        <TabsList>
          <TabsTrigger value="nichos" className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Nichos ({niches.length})
          </TabsTrigger>
          <TabsTrigger value="equipes" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Equipes ({equipes.length})
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuários ({profiles.length})
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: NICHOS
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="nichos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gestão de Nichos</CardTitle>
                <CardDescription>
                  Nichos definem os produtos SaaS multitenant. Cada nicho tem seu próprio subdomínio e configurações.
                </CardDescription>
              </div>
              <Button onClick={openCreateNiche} className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Novo Nicho
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID (slug)</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Domínio</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {niches.map((niche) => (
                    <TableRow key={niche.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{niche.id}</code>
                      </TableCell>
                      <TableCell className="font-medium">{niche.nome}</TableCell>
                      <TableCell className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        {niche.domain}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {niche.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={niche.active ? "default" : "secondary"}>
                          {niche.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditNiche(niche)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteNicheTarget(niche)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: EQUIPES
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="equipes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gestão de Equipes</CardTitle>
                <CardDescription>
                  Tenants do sistema. Cada equipe pertence a um nicho e tem suas próprias configurações de AI, webhook e créditos.
                </CardDescription>
              </div>
              <Button onClick={openCreateEquipe} className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Nova Equipe
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Nicho</TableHead>
                    <TableHead>Workspace ID</TableHead>
                    <TableHead>Créditos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipes.map((equipe) => {
                    const totalCredits = equipe.limite_creditos + equipe.creditos_avulsos;
                    return (
                      <TableRow key={equipe.id}>
                        <TableCell className="font-medium">{equipe.nome}</TableCell>
                        <TableCell>
                          {equipe.niche
                            ? <Badge variant="outline">{equipe.niche}</Badge>
                            : <span className="text-muted-foreground text-sm">-</span>}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 rounded">
                            {equipe.workspace_id ? equipe.workspace_id.slice(0, 14) + "…" : "-"}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{totalCredits.toLocaleString()}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(equipe.subscription_status)}>
                            {equipe.subscription_status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" title="Editar equipe" onClick={() => openEditEquipe(equipe)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Membros" onClick={() => openMembersSheet(equipe)}>
                            <UserCog className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Créditos" onClick={() => { setCreditsEquipe(equipe); setCreditsDialog(true); }}>
                            <Coins className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Excluir equipe" className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteEquipeTarget(equipe)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: USUÁRIOS
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="usuarios" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Gestão de Usuários</CardTitle>
              <CardDescription>Gerencie usuários, suas equipes e permissões.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Equipe</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => {
                    const equipe = equipes.find((e) => e.id === profile.equipe_id);
                    return (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">{profile.email}</TableCell>
                        <TableCell>{profile.nome_completo || "-"}</TableCell>
                        <TableCell>
                          {equipe
                            ? <Badge variant="outline">{equipe.nome}</Badge>
                            : <span className="text-muted-foreground text-sm">Sem equipe</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(profile.role)}>{profile.role}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm"
                            onClick={() => { setEditingProfile({ ...profile }); setUserDialog(true); }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: CREATE / EDIT NICHE
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={nicheDialog} onOpenChange={(o) => { setNicheDialog(o); if (!o) setEditingNiche(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNewNiche ? "Novo Nicho" : "Editar Nicho"}</DialogTitle>
            <DialogDescription>
              {isNewNiche
                ? "Crie um novo produto SaaS multitenant. Após criado, aponte o DNS do domínio para esta aplicação."
                : "Atualize as configurações do nicho."}
            </DialogDescription>
          </DialogHeader>
          {editingNiche && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ID / Slug <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="energia_solar"
                    value={editingNiche.id || ""}
                    disabled={!isNewNiche}
                    onChange={(e) => setEditingNiche({ ...editingNiche, id: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  />
                  <p className="text-xs text-muted-foreground">Sem espaços. Não pode ser alterado após criação.</p>
                </div>
                <div className="space-y-2">
                  <Label>Nome de exibição <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="Energia Solar CRM"
                    value={editingNiche.nome || ""}
                    onChange={(e) => setEditingNiche({ ...editingNiche, nome: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Domínio <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="solar.soloventures.com.br"
                  value={editingNiche.domain || ""}
                  onChange={(e) => setEditingNiche({ ...editingNiche, domain: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  placeholder="Máquina de Vendas para Energia Solar"
                  value={editingNiche.description || ""}
                  onChange={(e) => setEditingNiche({ ...editingNiche, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor primária (HSL)</Label>
                <Input
                  placeholder="28 100% 50%"
                  value={editingNiche.primary_color || ""}
                  onChange={(e) => setEditingNiche({ ...editingNiche, primary_color: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Formato: H S% L% — ex: "220 90% 56%" para azul</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="niche-active"
                  checked={editingNiche.active ?? true}
                  onCheckedChange={(v) => setEditingNiche({ ...editingNiche, active: v })}
                />
                <Label htmlFor="niche-active">Nicho ativo</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNicheDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveNiche}>
              {isNewNiche ? "Criar Nicho" : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: CREATE / EDIT EQUIPE
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={equipeDialog} onOpenChange={(o) => { setEquipeDialog(o); if (!o) setEditingEquipe(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{isNewEquipe ? "Nova Equipe" : `Editar: ${editingEquipe?.nome}`}</DialogTitle>
            <DialogDescription>
              Configure todos os dados do tenant — AI, webhook, créditos e links.
            </DialogDescription>
          </DialogHeader>
          {editingEquipe && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-2">

                {/* ── Dados básicos */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Dados Básicos
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="Minha Empresa"
                        value={editingEquipe.nome || ""}
                        onChange={(e) => setEditingEquipe({ ...editingEquipe, nome: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nicho</Label>
                      <Select
                        value={editingEquipe.niche || ""}
                        onValueChange={(v) => setEditingEquipe({ ...editingEquipe, niche: v || null })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar nicho…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— Nenhum —</SelectItem>
                          {niches.map((n) => (
                            <SelectItem key={n.id} value={n.id}>{n.nome} ({n.id})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ── AI Provider */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Bot className="h-4 w-4" /> Provedor de AI
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Provedor</Label>
                      <Select defaultValue="gpt_maker">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt_maker">GPT Maker</SelectItem>
                          <SelectItem value="openai" disabled>OpenAI (em breve)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Workspace ID</Label>
                      <Input
                        placeholder="wsp_xxxxxxx"
                        value={editingEquipe.workspace_id || ""}
                        onChange={(e) => setEditingEquipe({ ...editingEquipe, workspace_id: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label className="flex items-center gap-1"><Key className="h-3.5 w-3.5" /> Agent ID / Token</Label>
                    <Input
                      placeholder="agt_xxxxxxxxxxxxxxxx"
                      value={editingEquipe.gpt_maker_agent_id || ""}
                      onChange={(e) => setEditingEquipe({ ...editingEquipe, gpt_maker_agent_id: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <Switch
                      id="crm-agent"
                      checked={editingEquipe.is_crm_agent_enabled ?? false}
                      onCheckedChange={(v) => setEditingEquipe({ ...editingEquipe, is_crm_agent_enabled: v })}
                    />
                    <Label htmlFor="crm-agent">Agente de CRM ativado</Label>
                  </div>
                </div>

                <Separator />

                {/* ── Webhook */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Webhook className="h-4 w-4" /> Webhook
                  </h3>
                  <div className="space-y-2">
                    <Label>Webhook Secret</Label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={editingEquipe.webhook_secret || ""}
                        onChange={(e) => setEditingEquipe({ ...editingEquipe, webhook_secret: e.target.value })}
                        className="font-mono text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleRegenerateSecret} title="Gerar novo secret">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      URL de inbound: <code className="bg-muted px-1 rounded">/functions/v1/crm-webhook?secret={editingEquipe.webhook_secret?.slice(0, 8) || "…"}</code>
                    </p>
                  </div>
                </div>

                <Separator />

                {/* ── Home & Links */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Home className="h-4 w-4" /> Home & Links
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Texto explicativo da Home</Label>
                      <Textarea
                        placeholder="Descreva como sua equipe usa o sistema…"
                        value={editingEquipe.home_explanation || ""}
                        onChange={(e) => setEditingEquipe({ ...editingEquipe, home_explanation: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Link do CRM</Label>
                        <Input
                          placeholder="https://crm.empresa.com"
                          value={editingEquipe.crm_link || ""}
                          onChange={(e) => setEditingEquipe({ ...editingEquipe, crm_link: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Link de Suporte</Label>
                        <Input
                          placeholder="https://suporte.empresa.com"
                          value={editingEquipe.suporte_link || ""}
                          onChange={(e) => setEditingEquipe({ ...editingEquipe, suporte_link: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ── Créditos */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Créditos do Plano
                  </h3>
                  <div className="space-y-2">
                    <Label>Limite mensal de créditos</Label>
                    <Input
                      type="number"
                      value={editingEquipe.limite_creditos ?? 1000}
                      onChange={(e) => setEditingEquipe({ ...editingEquipe, limite_creditos: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Créditos avulsos são gerenciados pelo botão <Coins className="inline h-3 w-3" /> na tabela.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setEquipeDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEquipe}>
              {isNewEquipe ? "Criar Equipe" : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          SHEET: MEMBROS DA EQUIPE
      ════════════════════════════════════════════════════════════════════════ */}
      <Sheet open={membersSheet} onOpenChange={setMembersSheet}>
        <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Membros — {membersEquipe?.nome}
            </SheetTitle>
            <SheetDescription>
              Gerencie os membros desta equipe, suas roles e acesso.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4">
            {loadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : equipeMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum membro nesta equipe.
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {equipeMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.nome_completo || member.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      {member.cargo && (
                        <p className="text-xs text-muted-foreground">{member.cargo}</p>
                      )}
                    </div>
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleUpdateMemberRole(member, v)}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      title="Remover da equipe"
                      onClick={() => handleRemoveMember(member)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Para adicionar um membro, edite o usuário na aba <strong>Usuários</strong> e atribua esta equipe.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: CRÉDITOS
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={creditsDialog} onOpenChange={(o) => { setCreditsDialog(o); if (!o) { setCreditsEquipe(null); setCreditsToAdd(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Créditos</DialogTitle>
            <DialogDescription>
              Adicione créditos avulsos para <strong>{creditsEquipe?.nome}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Créditos atuais</Label>
              <p className="text-3xl font-bold tabular-nums">
                {creditsEquipe ? (creditsEquipe.limite_creditos + creditsEquipe.creditos_avulsos).toLocaleString() : 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Plano: {creditsEquipe?.limite_creditos.toLocaleString()} + Avulsos: {creditsEquipe?.creditos_avulsos.toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Quantidade a adicionar</Label>
              <Input
                type="number"
                value={creditsToAdd}
                onChange={(e) => setCreditsToAdd(e.target.value)}
                placeholder="Ex: 500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditsDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddCredits} disabled={!creditsToAdd || parseInt(creditsToAdd) <= 0}>
              <Coins className="h-4 w-4 mr-2" /> Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: EDIT USER
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={userDialog} onOpenChange={(o) => { setUserDialog(o); if (!o) setEditingProfile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>{editingProfile?.email}</DialogDescription>
          </DialogHeader>
          {editingProfile && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editingProfile.role || "user"}
                  onValueChange={(v) => setEditingProfile({ ...editingProfile, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Equipe</Label>
                <Select
                  value={editingProfile.equipe_id || "none"}
                  onValueChange={(v) => setEditingProfile({ ...editingProfile, equipe_id: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem equipe —</SelectItem>
                    {equipes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome} {e.niche ? `(${e.niche})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>Cancelar</Button>
            <Button onClick={handleUpdateProfile}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          ALERT DIALOGS: DELETE CONFIRMATIONS
      ════════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteNicheTarget} onOpenChange={(o) => { if (!o) setDeleteNicheTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover nicho "{deleteNicheTarget?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O nicho será removido do banco de dados. Equipes que usam este nicho não serão afetadas, mas deixarão de ter resolução automática de subdomínio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteNiche}>
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEquipeTarget} onOpenChange={(o) => { if (!o) setDeleteEquipeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover equipe "{deleteEquipeTarget?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os dados da equipe (leads, mensagens, pipeline, membros) serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteEquipe}>
              Sim, excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Admin;
