import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TenantLogo } from "@/components/TenantLogo";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantTheme } from "@/hooks/useTenantTheme";
import { CheckCircle2, Loader2, MailCheck, Zap } from "lucide-react";

/**
 * Sprint 8.2 — definir a senha e entrar.
 *
 * POR QUE ESTA PÁGINA EXISTE
 *
 * As boas-vindas diziam "o acesso foi enviado para o seu e-mail" e paravam aí.
 * A mensagem chega no WhatsApp, e a partir dali a pessoa depende de um e-mail
 * que pode estar no spam — ou que não saiu, porque o domínio do Resend ainda
 * não está verificado. Um cliente que acabou de assinar ficava sem entrar no
 * produto por causa disso.
 *
 * DOIS CAMINHOS, PORQUE SÃO DUAS SITUAÇÕES REAIS
 *
 *   1. Veio pelo link do e-mail de convite. O Supabase devolve a pessoa aqui
 *      com os tokens no fragmento da URL e o SDK abre a sessão sozinho
 *      (detectSessionInUrl). Já dá para escolher a senha.
 *
 *   2. Veio pelo link do WhatsApp, sem sessão nenhuma. Aí a página pede o
 *      e-mail e dispara o envio do link. É o mesmo destino: a pessoa volta
 *      para cá com sessão e cai no caminho 1.
 *
 * A resposta ao pedido de link é sempre a mesma, exista o e-mail ou não: dizer
 * "esse e-mail não está cadastrado" numa página pública transforma o
 * formulário num verificador de quem é cliente da Solo.
 */
export default function SetPassword() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  useTenantTheme();

  /** null enquanto o SDK ainda não decidiu se há sessão no link. */
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    // O SDK processa o fragmento da URL de forma assíncrona. Perguntar uma vez
    // só correria contra ele e mostraria o formulário de e-mail para quem
    // acabou de chegar pelo convite; o listener cobre a corrida.
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHasSession(!!session);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const requestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Informe o seu e-mail.");
      return;
    }
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/definir-senha`,
      });
      // Sucesso declarado sem consultar nada: ver o comentário do topo.
      setEmailSent(true);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As duas senhas não são iguais.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Senha definida! Bem-vindo.");
      // A sessão do convite já é uma sessão válida: a pessoa entra direto, sem
      // digitar de novo o que acabou de escolher.
      setTimeout(() => navigate("/home"), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(28_100%_50%/0.08),transparent_60%)]" />

      <Card className="w-full max-w-md relative bg-card/95 backdrop-blur border-border/50 shadow-2xl">
        <CardHeader className="space-y-6 text-center pb-4">
          <div className="flex justify-center">
            <TenantLogo className="h-10" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold text-foreground">
              {done ? "Tudo pronto!" : "Defina sua senha"}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {done
                ? "Estamos abrindo o seu ambiente."
                : hasSession
                  ? `Escolha a senha de acesso ao ${tenant.name}.`
                  : "Enviamos um link para o seu e-mail para confirmar que é você."}
            </CardDescription>
            <div className="flex items-center justify-center gap-1.5 text-primary text-sm font-medium">
              <span>Powered by Solo Ventures</span>
              <Zap className="h-4 w-4 fill-primary" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {hasSession === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-muted-foreground">
                Sua senha foi salva e você já está conectado.
              </p>
            </div>
          ) : hasSession ? (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="senha" className="text-foreground font-medium">Nova senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  placeholder="pelo menos 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-secondary/50 border-border focus:border-primary focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirma" className="text-foreground font-medium">Repita a senha</Label>
                <Input
                  id="confirma"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="bg-secondary/50 border-border focus:border-primary focus:ring-primary"
                />
              </div>
              <Button
                type="submit"
                className="w-full gradient-solo hover:opacity-90 text-white font-semibold h-11 shadow-lg"
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar e entrar"}
              </Button>
            </form>
          ) : emailSent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <MailCheck className="h-10 w-10 text-primary" />
              <p className="text-sm text-muted-foreground">
                Se <strong className="text-foreground">{email}</strong> tiver acesso ao {tenant.name},
                o link para definir a senha chega em instantes. Confira também a caixa de spam.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setEmailSent(false)}>
                Usar outro e-mail
              </Button>
            </div>
          ) : (
            <form onSubmit={requestLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Seu e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-secondary/50 border-border focus:border-primary focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  Use o mesmo e-mail que você informou ao aceitar a proposta.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full gradient-solo hover:opacity-90 text-white font-semibold h-11 shadow-lg"
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Receber o link de acesso"}
              </Button>
            </form>
          )}

          <p className="text-xs text-center text-muted-foreground mt-6">
            Já tem senha?{" "}
            <button className="text-primary hover:underline" onClick={() => navigate("/login")}>
              Entrar
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
