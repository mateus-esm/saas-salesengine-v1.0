import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Users, Key, Plus, Edit, Coins, Shield, Loader2 } from "lucide-react";

interface Equipe {
    id: string;
    nome: string;
    niche: string | null;
    gpt_maker_agent_id: string | null;
    limite_creditos: number;
    creditos_avulsos: number;
    webhook_secret: string | null;
    created_at: string;
}

interface Profile {
    id: string;
    email: string | null;
    nome_completo: string | null;
    equipe_id: string | null;
    role: string | null;
}

const Admin = () => {
    const navigate = useNavigate();
    const { isSuperAdmin } = useRole();
    const [equipes, setEquipes] = useState<Equipe[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingEquipe, setEditingEquipe] = useState<Equipe | null>(null);
    const [addCreditsEquipe, setAddCreditsEquipe] = useState<Equipe | null>(null);
    const [creditsToAdd, setCreditsToAdd] = useState("");
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

    // Redirect if not super_admin
    useEffect(() => {
        if (!isSuperAdmin()) {
            navigate("/home");
        }
    }, [isSuperAdmin, navigate]);

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [equipesRes, profilesRes] = await Promise.all([
                    supabase.from("equipes").select("*").order("nome"),
                    supabase.from("profiles").select("*").order("email"),
                ]);

                if (equipesRes.data) setEquipes(equipesRes.data);
                if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
            } catch (error) {
                console.error("Error fetching admin data:", error);
                toast.error("Erro ao carregar dados");
            } finally {
                setLoading(false);
            }
        };

        if (isSuperAdmin()) {
            fetchData();
        }
    }, [isSuperAdmin]);

    const handleUpdateEquipe = async () => {
        if (!editingEquipe) return;

        try {
            const { error } = await supabase
                .from("equipes")
                .update({
                    nome: editingEquipe.nome,
                    niche: editingEquipe.niche,
                    gpt_maker_agent_id: editingEquipe.gpt_maker_agent_id,
                    webhook_secret: editingEquipe.webhook_secret,
                })
                .eq("id", editingEquipe.id);

            if (error) throw error;

            setEquipes(prev =>
                prev.map(e => (e.id === editingEquipe.id ? editingEquipe : e))
            );
            setEditingEquipe(null);
            toast.success("Equipe atualizada!");
        } catch (error) {
            console.error("Error updating equipe:", error);
            toast.error("Erro ao atualizar equipe");
        }
    };

    const handleAddCredits = async () => {
        if (!addCreditsEquipe || !creditsToAdd) return;

        try {
            const newCredits = addCreditsEquipe.creditos_avulsos + parseInt(creditsToAdd);

            const { error } = await supabase
                .from("equipes")
                .update({ creditos_avulsos: newCredits })
                .eq("id", addCreditsEquipe.id);

            if (error) throw error;

            setEquipes(prev =>
                prev.map(e =>
                    e.id === addCreditsEquipe.id
                        ? { ...e, creditos_avulsos: newCredits }
                        : e
                )
            );
            setAddCreditsEquipe(null);
            setCreditsToAdd("");
            toast.success(`${creditsToAdd} créditos adicionados!`);
        } catch (error) {
            console.error("Error adding credits:", error);
            toast.error("Erro ao adicionar créditos");
        }
    };

    const handleUpdateProfileRole = async () => {
        if (!editingProfile) return;

        try {
            // Note: Role updates should ideally be done via a separate user_roles table
            // For now, updating the role field in profiles (if it exists)
            const { error } = await supabase
                .from("profiles")
                .update({ role: editingProfile.role } as any)
                .eq("id", editingProfile.id);

            if (error) throw error;

            setProfiles(prev =>
                prev.map(p => (p.id === editingProfile.id ? editingProfile : p))
            );
            setEditingProfile(null);
            toast.success("Perfil atualizado!");
        } catch (error) {
            console.error("Error updating profile:", error);
            toast.error("Erro ao atualizar perfil");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Shield className="h-8 w-8" />
                        Admin Panel
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerenciamento de equipes, usuários e configurações
                    </p>
                </div>
            </div>

            <Tabs defaultValue="equipes">
                <TabsList>
                    <TabsTrigger value="equipes" className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Equipes ({equipes.length})
                    </TabsTrigger>
                    <TabsTrigger value="usuarios" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Usuários ({profiles.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="equipes" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestão de Equipes</CardTitle>
                            <CardDescription>
                                Gerencie as equipes, seus secrets e créditos
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Nicho</TableHead>
                                        <TableHead>Agent ID</TableHead>
                                        <TableHead>Créditos</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {equipes.map(equipe => (
                                        <TableRow key={equipe.id}>
                                            <TableCell className="font-medium">{equipe.nome}</TableCell>
                                            <TableCell>{equipe.niche || "-"}</TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-1 rounded">
                                                    {equipe.gpt_maker_agent_id?.slice(0, 12) || "-"}...
                                                </code>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">
                                                    {equipe.limite_creditos + equipe.creditos_avulsos}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setEditingEquipe(equipe)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>Editar Equipe</DialogTitle>
                                                            <DialogDescription>
                                                                Atualize as informações e secrets da equipe
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        {editingEquipe && (
                                                            <div className="space-y-4 py-4">
                                                                <div className="space-y-2">
                                                                    <Label>Nome</Label>
                                                                    <Input
                                                                        value={editingEquipe.nome}
                                                                        onChange={e =>
                                                                            setEditingEquipe({
                                                                                ...editingEquipe,
                                                                                nome: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label>Nicho</Label>
                                                                    <Input
                                                                        value={editingEquipe.niche || ""}
                                                                        onChange={e =>
                                                                            setEditingEquipe({
                                                                                ...editingEquipe,
                                                                                niche: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label>GPT Maker Agent ID</Label>
                                                                    <Input
                                                                        value={editingEquipe.gpt_maker_agent_id || ""}
                                                                        onChange={e =>
                                                                            setEditingEquipe({
                                                                                ...editingEquipe,
                                                                                gpt_maker_agent_id: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label>Webhook Secret</Label>
                                                                    <Input
                                                                        type="password"
                                                                        value={editingEquipe.webhook_secret || ""}
                                                                        onChange={e =>
                                                                            setEditingEquipe({
                                                                                ...editingEquipe,
                                                                                webhook_secret: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                        <DialogFooter>
                                                            <Button onClick={handleUpdateEquipe}>
                                                                Salvar Alterações
                                                            </Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>

                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setAddCreditsEquipe(equipe)}
                                                        >
                                                            <Coins className="h-4 w-4" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>Adicionar Créditos</DialogTitle>
                                                            <DialogDescription>
                                                                Adicione créditos avulsos para {addCreditsEquipe?.nome}
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <div className="space-y-4 py-4">
                                                            <div className="space-y-2">
                                                                <Label>Créditos atuais</Label>
                                                                <p className="text-2xl font-bold">
                                                                    {addCreditsEquipe
                                                                        ? addCreditsEquipe.limite_creditos +
                                                                        addCreditsEquipe.creditos_avulsos
                                                                        : 0}
                                                                </p>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label>Quantidade a adicionar</Label>
                                                                <Input
                                                                    type="number"
                                                                    value={creditsToAdd}
                                                                    onChange={e => setCreditsToAdd(e.target.value)}
                                                                    placeholder="100"
                                                                />
                                                            </div>
                                                        </div>
                                                        <DialogFooter>
                                                            <Button onClick={handleAddCredits}>
                                                                <Plus className="h-4 w-4 mr-2" />
                                                                Adicionar Créditos
                                                            </Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="usuarios" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gestão de Usuários</CardTitle>
                            <CardDescription>
                                Gerencie os usuários e suas permissões
                            </CardDescription>
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
                                    {profiles.map(profile => {
                                        const equipe = equipes.find(e => e.id === profile.equipe_id);
                                        return (
                                            <TableRow key={profile.id}>
                                                <TableCell className="font-medium">
                                                    {profile.email}
                                                </TableCell>
                                                <TableCell>{profile.nome_completo || "-"}</TableCell>
                                                <TableCell>{equipe?.nome || "-"}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            profile.role === "super_admin"
                                                                ? "default"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {profile.role || "user"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setEditingProfile(profile)}
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>Editar Usuário</DialogTitle>
                                                                <DialogDescription>
                                                                    Atualize a role do usuário {editingProfile?.email}
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            {editingProfile && (
                                                                <div className="space-y-4 py-4">
                                                                    <div className="space-y-2">
                                                                        <Label>Role</Label>
                                                                        <Select
                                                                            value={editingProfile.role || "user"}
                                                                            onValueChange={value =>
                                                                                setEditingProfile({
                                                                                    ...editingProfile,
                                                                                    role: value,
                                                                                })
                                                                            }
                                                                        >
                                                                            <SelectTrigger>
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="user">User</SelectItem>
                                                                                <SelectItem value="admin">Admin</SelectItem>
                                                                                <SelectItem value="owner">Owner</SelectItem>
                                                                                <SelectItem value="super_admin">
                                                                                    Super Admin
                                                                                </SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <DialogFooter>
                                                                <Button onClick={handleUpdateProfileRole}>
                                                                    Salvar Alterações
                                                                </Button>
                                                            </DialogFooter>
                                                        </DialogContent>
                                                    </Dialog>
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
        </div>
    );
};

export default Admin;
