import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { ProposalsTab } from "@/components/admin/proposals/ProposalsTab";
import { AdminBillingTab } from "@/components/admin/billing/BillingTab";
import { NotificationsTab } from "@/components/admin/notifications/NotificationsTab";
import { TeamBillingDialog, type TeamBillingRow } from "@/components/admin/billing/TeamBillingDialog";
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
  CreditCard, Bot, ChevronRight, UserMinus, UserPlus, Copy, RefreshCcw,
  Radio,
  FileText,
  Receipt,
  Bell,
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
  page_permissions?: Record<string, boolean>;
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

// Os valores válidos de ?tab=. Uma lista fechada porque a URL é digitável, e
// um valor inventado não pode deixar a página sem nenhuma aba selecionada.
const ADMIN_TABS = [
  "nichos", "equipes", "usuarios", "solo-instances",
  "propostas", "faturamento", "notificacoes",
];

// ─── Main Component ────────────────────────────────────────────────────────────

const Admin = () => {
  const navigate = useNavigate();

  // ─── Aba ativa: mora na URL, não em useState ────────────────────────────────
  //
  // No celular, sair do navegador e voltar não é uma pausa: o sistema descarta
  // a aba e o app roda de novo do zero. Com `defaultValue` isso jogava você em
  // "Nichos" toda vez, e o passo em que você estava sumia.
  //
  // A URL sobrevive a esse recarregamento — e de quebra o link fica
  // compartilhável e o botão voltar do celular sai do Admin em vez de
  // percorrer as sete abas.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const activeTab = ADMIN_TABS.includes(tabParam) ? tabParam : "nichos";
  const setActiveTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    // replace: trocar de aba não é navegação — não deve empilhar histórico.
    setSearchParams(next, { replace: true });
  };
  const { role, isSuperAdmin, loadingRole } = useRole();

  // ── Data state
  const [niches, setNiches] = useState<Niche[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithRole[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [wppInstances, setWppInstances] = useState<any[]>([]);
  const [syncingBillingId, setSyncingBillingId] = useState<string | null>(null);
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

  // ── Credits / billing dialog state (Sprint 8.2)
  //
  // The coin button used to open a dialog of its own that wrote
  // equipes.creditos_avulsos — a column no Billing v1 code path reads. Credits
  // went in and nothing moved: not the client's balance, not the agent. It now
  // opens the SAME dialog as the Faturamento tab, so there is one way to grant
  // credits and it is the one that reaches the ledger.
  const [billingDialog, setBillingDialog] = useState(false);
  const [billingTeam, setBillingTeam] = useState<TeamBillingRow | null>(null);
  const [loadingBillingId, setLoadingBillingId] = useState<string | null>(null);
  /** equipe_id -> billing row, so the table can show the REAL balances. */
  const [billingByEquipe, setBillingByEquipe] = useState<Record<string, TeamBillingRow>>({});

  // ── Members sheet state
  const [membersSheet, setMembersSheet] = useState(false);
  const [membersEquipe, setMembersEquipe] = useState<Equipe | null>(null);
  const [equipeMembers, setEquipeMembers] = useState<ProfileWithRole[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── User dialog state
  const [userDialog, setUserDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileWithRole | null>(null);

  // ── Sprint 5.5 EPIC 4 — Add member dialog state
  const [addMemberDialog, setAddMemberDialog] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<string>("user");
  const [creatingMember, setCreatingMember] = useState(false);

  // ── Add User dialog state (standalone — Usuários tab)
  const [addUserDialog, setAddUserDialog] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<string>("user");
  const [newUserEquipe, setNewUserEquipe] = useState<string>("");
  const [creatingUser, setCreatingUser] = useState(false);

  // ─── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadingRole) return;
    if (role !== "super_admin") navigate("/home");
  }, [loadingRole, role, navigate]);

  // ─── Fetch all data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [nichesRes, equipesRes, profilesRes, rolesRes, wppRes, billingRes] = await Promise.all([
        supabase.from("niches" as any).select("*").order("nome"),
        supabase.from("equipes").select("*").order("nome"),
        supabase.from("profiles").select("id, user_id, email, nome_completo, equipe_id, cargo").order("email"),
        supabase.from("user_roles").select("*"),
        supabase.from("wpp_instances").select("*, equipes(id, nome)").order("created_at", { ascending: false }),
        // The only source of a real balance. equipes.creditos_avulsos is a
        // deprecated column pinned at 0 and must never be shown as one.
        supabase.from("v_admin_team_billing").select("*"),
      ]);

      if (nichesRes.data) setNiches(nichesRes.data as unknown as Niche[]);
      if (equipesRes.data) setEquipes(equipesRes.data as Equipe[]);

      setBillingByEquipe(
        Object.fromEntries(
          ((billingRes.data ?? []) as TeamBillingRow[]).map((row) => [row.equipe_id, row]),
        ),
      );

      const roles = (rolesRes.data || []) as UserRole[];
      setUserRoles(roles);

      if (profilesRes.data) {
        const merged = profilesRes.data.map((p) => ({
          ...(p as Profile),
          role: roles.find((r) => r.user_id === p.user_id)?.role || "user",
        })) as ProfileWithRole[];
        setProfiles(merged);
      }

      if (wppRes.data) setWppInstances(wppRes.data);
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

  const DEFAULT_PERMISSIONS = {
    webhooks: true,
    ai_studio: true,
    billing: true,
    toolkit: true,
    clube: true,
    suporte: true,
  };

  const openCreateEquipe = () => {
    setEditingEquipe({
      nome: "", niche: "", gpt_maker_agent_id: "", workspace_id: "",
      home_explanation: "", crm_link: "", suporte_link: "",
      webhook_secret: "", limite_creditos: 1000, creditos_avulsos: 0,
      is_crm_agent_enabled: false,
      page_permissions: { ...DEFAULT_PERMISSIONS },
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
          // IDs vêm de copy-paste — trim evita '\n' invisível que quebra as URLs da API
          gpt_maker_agent_id: editingEquipe.gpt_maker_agent_id?.trim() || null,
          workspace_id: editingEquipe.workspace_id?.trim() || null,
          home_explanation: editingEquipe.home_explanation || null,
          crm_link: editingEquipe.crm_link || "",
          suporte_link: editingEquipe.suporte_link || "",
          webhook_secret: editingEquipe.webhook_secret || undefined,
          limite_creditos: editingEquipe.limite_creditos ?? 1000,
          is_crm_agent_enabled: editingEquipe.is_crm_agent_enabled ?? false,
          page_permissions: editingEquipe.page_permissions || DEFAULT_PERMISSIONS,
        } as any);
        if (error) throw error;
        toast.success("Equipe criada!");
      } else {
        const { error } = await supabase
          .from("equipes")
          .update({
            nome: editingEquipe.nome,
            niche: editingEquipe.niche || null,
            // IDs vêm de copy-paste — trim evita '\n' invisível que quebra as URLs da API
            gpt_maker_agent_id: editingEquipe.gpt_maker_agent_id?.trim() || null,
            workspace_id: editingEquipe.workspace_id?.trim() || null,
            home_explanation: editingEquipe.home_explanation || null,
            crm_link: editingEquipe.crm_link || "",
            suporte_link: editingEquipe.suporte_link || "",
            webhook_secret: editingEquipe.webhook_secret || null,
            limite_creditos: editingEquipe.limite_creditos ?? 1000,
            is_crm_agent_enabled: editingEquipe.is_crm_agent_enabled ?? false,
            page_permissions: editingEquipe.page_permissions || DEFAULT_PERMISSIONS,
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

  /**
   * Open the billing panel for one team, straight from the Equipes table.
   *
   * The row is re-fetched rather than taken from `billingByEquipe` so the dialog
   * opens on current numbers — the table may have been sitting on screen for a
   * while, and a stale balance is what makes someone grant twice.
   */
  const openTeamBilling = async (equipe: Equipe) => {
    setLoadingBillingId(equipe.id);
    try {
      const { data, error } = await supabase
        .from("v_admin_team_billing")
        .select("*")
        .eq("equipe_id", equipe.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("Faturamento indisponível para esta equipe");
        return;
      }
      setBillingTeam(data as TeamBillingRow);
      setBillingDialog(true);
    } catch (err: any) {
      toast.error(err.message || "Erro ao abrir faturamento");
    } finally {
      setLoadingBillingId(null);
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

  // ─── Add Member (EPIC 4) ─────────────────────────────────────────────────────

  const generateTempPassword = useCallback(() => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    setNewMemberPassword(out);
  }, []);

  const openAddMemberDialog = () => {
    setNewMemberEmail("");
    setNewMemberName("");
    setNewMemberPassword("");
    setNewMemberRole("user");
    setAddMemberDialog(true);
    // Pre-fill a temp password so the admin doesn't have to think of one.
    generateTempPassword();
  };

  const handleCreateMember = async () => {
    if (!membersEquipe) return;
    if (!newMemberEmail.trim() || !newMemberPassword || newMemberPassword.length < 8) {
      toast.error("Email e senha (mín. 8 caracteres) são obrigatórios");
      return;
    }
    setCreatingMember(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-equipe-member",
        {
          body: {
            email: newMemberEmail.trim().toLowerCase(),
            password: newMemberPassword,
            full_name: newMemberName.trim() || null,
            equipe_id: membersEquipe.id,
            role: newMemberRole,
          },
        }
      );
      if (error) throw new Error(error.message || "Erro ao criar membro");
      if ((data as any)?.error) throw new Error((data as any).error);

      // Show the temp password to the admin so they can hand it off.
      const tempPw = newMemberPassword;
      toast.success(
        `${newMemberEmail} criado! Senha temporária: ${tempPw}`,
        {
          duration: 20000,
          action: {
            label: "Copiar senha",
            onClick: () => navigator.clipboard.writeText(tempPw),
          },
        }
      );

      setAddMemberDialog(false);
      // Refresh the members list and global data so the new user appears.
      await fetchData();
      if (membersEquipe) await openMembersSheet(membersEquipe);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar membro";
      toast.error(msg);
    } finally {
      setCreatingMember(false);
    }
  };

  // ─── Add User (standalone — Usuários tab) ───────────────────────────────────

  const generateUserPassword = useCallback(() => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    setNewUserPassword(out);
  }, []);

  const openAddUserDialog = () => {
    setNewUserEmail("");
    setNewUserName("");
    setNewUserPassword("");
    setNewUserRole("user");
    setNewUserEquipe("");
    setAddUserDialog(true);
    generateUserPassword();
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserPassword || newUserPassword.length < 8) {
      toast.error("Email e senha (mín. 8 caracteres) são obrigatórios");
      return;
    }
    if (!newUserEquipe) {
      toast.error("Selecione uma equipe");
      return;
    }
    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-equipe-member", {
        body: {
          email: newUserEmail.trim().toLowerCase(),
          password: newUserPassword,
          full_name: newUserName.trim() || null,
          equipe_id: newUserEquipe,
          role: newUserRole,
        },
      });
      if (error) throw new Error(error.message || "Erro ao criar usuário");
      if ((data as any)?.error) throw new Error((data as any).error);

      const tempPw = newUserPassword;
      toast.success(`${newUserEmail} criado! Senha temporária: ${tempPw}`, {
        duration: 20000,
        action: {
          label: "Copiar senha",
          onClick: () => navigator.clipboard.writeText(tempPw),
        },
      });

      setAddUserDialog(false);
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar usuário";
      toast.error(msg);
    } finally {
      setCreatingUser(false);
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

  // ─── Solo API Instances handlers ──────────────────────────────────────────────

  const handleSyncBilling = async (instance: any) => {
    setSyncingBillingId(instance.id);
    try {
      const { data, error } = await supabase.functions.invoke('sync-instance-billing', {
        body: { equipe_id: instance.equipe_id },
      });
      if (error) throw new Error(error.message || "Erro ao sincronizar billing");

      const result = data as any;
      if (result.skipped) {
        toast.success(`Sincronização pulada: ${result.skipped}`);
      } else {
        toast.success(`Billing sincronizado com sucesso`);
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao sincronizar billing");
    } finally {
      setSyncingBillingId(null);
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
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 md:h-8 md:w-8" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerenciamento completo de nichos, equipes e usuários
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
          <TabsTrigger value="solo-instances" className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Instâncias Solo ({wppInstances.length})
          </TabsTrigger>
          {/* Sprint 8 T15/T16 */}
          <TabsTrigger value="propostas" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Propostas
          </TabsTrigger>
          <TabsTrigger value="faturamento" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Faturamento
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notificações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="propostas" className="mt-4">
          <ProposalsTab />
        </TabsContent>

        <TabsContent value="faturamento" className="mt-4">
          <AdminBillingTab />
        </TabsContent>

        <TabsContent value="notificacoes" className="mt-4">
          <NotificationsTab />
        </TabsContent>

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
                    const billing = billingByEquipe[equipe.id];
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
                        {/* Two pools, never a single number: Copilot credits do
                            not keep the WhatsApp agent alive, so summing them
                            would hide the one that matters. */}
                        <TableCell>
                          {billing ? (
                            <div className="flex flex-col gap-0.5 text-xs">
                              <span className="flex items-center gap-1">
                                <Badge variant={billing.whatsapp_balance > 0 ? "secondary" : "destructive"}>
                                  {billing.whatsapp_balance.toLocaleString()}
                                </Badge>
                                <span className="text-muted-foreground">atend.</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <Badge variant="outline">{billing.copilot_balance.toLocaleString()}</Badge>
                                <span className="text-muted-foreground">copiloto</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
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
                          <Button
                            variant="ghost" size="sm"
                            title="Créditos, plano e adicionais"
                            disabled={loadingBillingId !== null}
                            onClick={() => openTeamBilling(equipe)}
                          >
                            {loadingBillingId === equipe.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Coins className="h-4 w-4" />}
                          </Button>
                          {billing?.agent_paused_at && (
                            <Badge variant="destructive" className="align-middle text-[10px]">
                              agente off
                            </Badge>
                          )}
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gestão de Usuários</CardTitle>
                <CardDescription>Gerencie usuários, suas equipes e permissões.</CardDescription>
              </div>
              <Button onClick={openAddUserDialog} className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Adicionar Usuário
              </Button>
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

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: INSTÂNCIAS SOLO
        ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="solo-instances" className="mt-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Instâncias Solo API</CardTitle>
                <CardDescription>
                  Gerenciamento de instâncias WhatsApp Solo API por equipe. Painel read-only com sincronização de billing.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {wppInstances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma instância Solo API registrada.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Nome da Instância</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Billing Ativo</TableHead>
                      <TableHead>Conectada em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wppInstances.map((instance: any) => {
                      const tenantName = instance.equipes?.nome || "-";
                      const displayName = instance.display_name || instance.instance_name || "-";
                      const status = instance.status || "desconhecido";
                      const phone = instance.phone || "-";
                      const billingActive = instance.billing_active ? "Ativo" : "Inativo";
                      const connectedAt = instance.connected_at
                        ? new Date(instance.connected_at).toLocaleDateString("pt-BR")
                        : "-";

                      return (
                        <TableRow key={instance.id}>
                          <TableCell className="font-medium">{tenantName}</TableCell>
                          <TableCell>{displayName}</TableCell>
                          <TableCell>
                            <Badge variant={status === "connected" ? "default" : "secondary"}>
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{phone}</TableCell>
                          <TableCell>
                            <Badge variant={instance.billing_active ? "default" : "secondary"}>
                              {billingActive}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{connectedAt}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Sincronizar billing"
                              onClick={() => handleSyncBilling(instance)}
                              disabled={syncingBillingId === instance.id}
                            >
                              {syncingBillingId === instance.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNewEquipe ? "Nova Equipe" : `Editar: ${editingEquipe?.nome}`}</DialogTitle>
            <DialogDescription>
              Configure todos os dados do tenant — AI, webhook, créditos e links.
            </DialogDescription>
          </DialogHeader>
          {editingEquipe && (
            <div className="max-h-[65vh] overflow-y-auto pr-1">
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
                        value={editingEquipe.niche || "__none__"}
                        onValueChange={(v) => setEditingEquipe({ ...editingEquipe, niche: v === "__none__" ? null : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar nicho…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Nenhum —</SelectItem>
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
                          <SelectItem value="gpt_maker">AI Engine</SelectItem>
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

                {/* ── Créditos
                    No editable number here on purpose. `limite_creditos` is a
                    pre-billing column that grants nothing: the allowance comes
                    from the plan on the contract, and any manual credit has to
                    go through the ledger or the client never sees it. */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Créditos e Plano
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Gerenciados pelo botão <Coins className="inline h-3 w-3" /> na tabela de equipes
                    (ou pela aba Faturamento): carteira de Atendimento, carteira de Copiloto,
                    plano e adicionais. É o único caminho que chega no extrato do cliente e
                    religa o agente.
                  </p>
                </div>

                <Separator />

                {/* ── Permissões de Páginas */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Permissões de Páginas
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Webhooks */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="perm-webhooks" className="text-xs font-semibold">Webhooks</Label>
                        <p className="text-[10px] text-muted-foreground">Gerenciar webhooks de entrada e saída</p>
                      </div>
                      <Switch
                        id="perm-webhooks"
                        checked={editingEquipe.page_permissions?.webhooks ?? true}
                        onCheckedChange={(v) => setEditingEquipe({
                          ...editingEquipe,
                          page_permissions: { ...editingEquipe.page_permissions, webhooks: v }
                        })}
                      />
                    </div>

                    {/* AI Studio */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="perm-ai-studio" className="text-xs font-semibold">AI Studio</Label>
                        <p className="text-[10px] text-muted-foreground">Acesso ao laboratório de prompts de IA</p>
                      </div>
                      <Switch
                        id="perm-ai-studio"
                        checked={editingEquipe.page_permissions?.ai_studio ?? true}
                        onCheckedChange={(v) => setEditingEquipe({
                          ...editingEquipe,
                          page_permissions: { ...editingEquipe.page_permissions, ai_studio: v }
                        })}
                      />
                    </div>

                    {/* Billing */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="perm-billing" className="text-xs font-semibold">Faturamento (Billing)</Label>
                        <p className="text-[10px] text-muted-foreground">Acesso a faturas e planos de créditos</p>
                      </div>
                      <Switch
                        id="perm-billing"
                        checked={editingEquipe.page_permissions?.billing ?? true}
                        onCheckedChange={(v) => setEditingEquipe({
                          ...editingEquipe,
                          page_permissions: { ...editingEquipe.page_permissions, billing: v }
                        })}
                      />
                    </div>

                    {/* Toolkit */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="perm-toolkit" className="text-xs font-semibold">Toolkit</Label>
                        <p className="text-[10px] text-muted-foreground">Acesso a ferramentas utilitárias</p>
                      </div>
                      <Switch
                        id="perm-toolkit"
                        checked={editingEquipe.page_permissions?.toolkit ?? true}
                        onCheckedChange={(v) => setEditingEquipe({
                          ...editingEquipe,
                          page_permissions: { ...editingEquipe.page_permissions, toolkit: v }
                        })}
                      />
                    </div>

                    {/* Clube Solo */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="perm-clube" className="text-xs font-semibold">Clube Solo</Label>
                        <p className="text-[10px] text-muted-foreground">Acesso ao clube de benefícios e recompensas</p>
                      </div>
                      <Switch
                        id="perm-clube"
                        checked={editingEquipe.page_permissions?.clube ?? true}
                        onCheckedChange={(v) => setEditingEquipe({
                          ...editingEquipe,
                          page_permissions: { ...editingEquipe.page_permissions, clube: v }
                        })}
                      />
                    </div>

                    {/* Suporte */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="perm-suporte" className="text-xs font-semibold">Suporte</Label>
                        <p className="text-[10px] text-muted-foreground">Abertura de chamados de suporte técnico</p>
                      </div>
                      <Switch
                        id="perm-suporte"
                        checked={editingEquipe.page_permissions?.suporte ?? true}
                        onCheckedChange={(v) => setEditingEquipe({
                          ...editingEquipe,
                          page_permissions: { ...editingEquipe.page_permissions, suporte: v }
                        })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="pt-2 border-t">
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
            <Button className="w-full" onClick={openAddMemberDialog}>
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar Membro
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              O membro recebe uma senha temporária para o primeiro login.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: CRÉDITOS, PLANO E ADICIONAIS (Sprint 8.2)

          The very same component the Faturamento tab opens. Two dialogs meant
          two code paths, and the one that was easier to reach wrote to a dead
          column — so there is now exactly one.
      ════════════════════════════════════════════════════════════════════════ */}
      <TeamBillingDialog
        team={billingTeam}
        open={billingDialog}
        onOpenChange={(o) => { setBillingDialog(o); if (!o) setBillingTeam(null); }}
        onChanged={fetchData}
      />

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: ADD MEMBER (Sprint 5.5 EPIC 4)
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={addMemberDialog} onOpenChange={setAddMemberDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar Membro
            </DialogTitle>
            <DialogDescription>
              Cria a conta direto, sem email. Você entrega a senha temporária
              para <strong>{membersEquipe?.nome}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-member-email">Email *</Label>
              <Input
                id="new-member-email"
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="novo.membro@empresa.com"
                disabled={creatingMember}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-member-name">Nome completo</Label>
              <Input
                id="new-member-name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Maria Silva"
                disabled={creatingMember}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-member-password">Senha temporária *</Label>
              <div className="flex gap-2">
                <Input
                  id="new-member-password"
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  placeholder="Mín. 8 caracteres"
                  disabled={creatingMember}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Gerar nova senha"
                  onClick={generateTempPassword}
                  disabled={creatingMember}
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copiar senha"
                  onClick={() => {
                    if (newMemberPassword) {
                      navigator.clipboard.writeText(newMemberPassword);
                      toast.success("Senha copiada");
                    }
                  }}
                  disabled={creatingMember || !newMemberPassword}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                O membro deve trocar a senha no primeiro login.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newMemberRole}
                onValueChange={setNewMemberRole}
                disabled={creatingMember}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) =>
                    isSuperAdmin ? true : r !== "super_admin"
                  ).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddMemberDialog(false)}
              disabled={creatingMember}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateMember} disabled={creatingMember}>
              {creatingMember ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Criar Membro
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          DIALOG: ADD USER (standalone — Usuários tab)
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={addUserDialog} onOpenChange={setAddUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar Usuário
            </DialogTitle>
            <DialogDescription>
              Cria a conta direto, sem email. Você entrega a senha temporária para o novo membro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email *</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="novo.membro@empresa.com"
                disabled={creatingUser}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-name">Nome completo</Label>
              <Input
                id="new-user-name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Maria Silva"
                disabled={creatingUser}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">Senha temporária *</Label>
              <div className="flex gap-2">
                <Input
                  id="new-user-password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mín. 8 caracteres"
                  disabled={creatingUser}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Gerar nova senha"
                  onClick={generateUserPassword}
                  disabled={creatingUser}
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copiar senha"
                  onClick={() => {
                    if (newUserPassword) {
                      navigator.clipboard.writeText(newUserPassword);
                      toast.success("Senha copiada");
                    }
                  }}
                  disabled={creatingUser || !newUserPassword}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                O membro deve trocar a senha no primeiro login.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Equipe *</Label>
              <Select value={newUserEquipe} onValueChange={setNewUserEquipe} disabled={creatingUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar equipe…" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome} {e.niche ? `(${e.niche})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={newUserRole}
                onValueChange={setNewUserRole}
                disabled={creatingUser}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) =>
                    isSuperAdmin ? true : r !== "super_admin"
                  ).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddUserDialog(false)}
              disabled={creatingUser}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={creatingUser}>
              {creatingUser ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Criar Usuário
                </>
              )}
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
