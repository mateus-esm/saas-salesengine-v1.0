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
import { Zap } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(28_100%_50%/0.08),transparent_60%)]" />
      
      <Card className="w-full max-w-md relative bg-card/95 backdrop-blur border-border/50 shadow-2xl">
        <CardHeader className="space-y-6 text-center pb-4">
          {/* Logo */}
          <div className="flex justify-center">
            <TenantLogo className="h-10" />
          </div>
          
          {/* Tenant Portal Title */}
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold text-foreground">
              {tenant.name} Portal
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {tenant.description}
            </CardDescription>
            <div className="flex items-center justify-center gap-1.5 text-primary text-sm font-medium">
              <span>Powered by Solo Ventures</span>
              <Zap className="h-4 w-4 fill-primary" />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary/50 border-border focus:border-primary focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary/50 border-border focus:border-primary focus:ring-primary"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full gradient-solo hover:opacity-90 text-white font-semibold h-11 shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Acessar Portal"}
            </Button>
          </form>
          <p className="text-xs text-center text-muted-foreground mt-6">
            Ao acessar, você concorda com nossos termos de uso
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;