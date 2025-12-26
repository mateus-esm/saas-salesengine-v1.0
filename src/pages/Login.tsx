import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { TenantLogo } from "@/components/TenantLogo";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantTheme } from "@/hooks/useTenantTheme";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const { tenant } = useTenant();
  useTenantTheme();

  useEffect(() => {
    if (user) {
      navigate("/home");
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        toast.error("E-mail ou senha incorretos.");
      } else if (error.message.includes("Email not confirmed")) {
        toast.error("Por favor, confirme seu e-mail antes de fazer login.");
      } else {
        toast.error("Erro ao fazer login. Tente novamente.");
      }
      setIsLoading(false);
    } else {
      toast.success("Login bem-sucedido!");
      navigate("/home");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-soft-gray to-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(28_100%_50%/0.1),transparent_50%)]" />
      
      <Card className="w-full max-w-md relative shadow-[var(--shadow-elegant)] border-primary/20">
        <CardHeader className="space-y-6 text-center">
          <div className="flex justify-center">
            <div className="relative">
              <TenantLogo className="h-12" />
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent blur-xl" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">{tenant.name} Portal</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              {tenant.description}
              <br />
              <span className="text-xs text-primary font-medium">Powered by Solo Ventures ⚡</span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-border focus:border-primary focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-border focus:border-primary focus:ring-primary"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-primary to-[hsl(45_100%_60%)] hover:opacity-90 text-primary-foreground font-medium shadow-[var(--shadow-elegant)]"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Acessar Portal"}
            </Button>
          </form>
          <p className="text-xs text-center text-muted-foreground mt-4">
            Ao acessar, você concorda com nossos termos de uso
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
