import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Mail, Phone } from "lucide-react";

const Suporte = () => {
  const { equipe } = useAuth();
  const { tenant } = useTenant();

  const whatsappLink = "https://wa.me/5585996487923?text=Olá! Preciso de suporte com o " + tenant.name;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            Suporte <span className="text-primary">{tenant.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre em contato com nossa equipe
          </p>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                WhatsApp
              </CardTitle>
              <CardDescription>Atendimento rápido via WhatsApp</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Abrir WhatsApp
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                E-mail
              </CardTitle>
              <CardDescription>Suporte por e-mail</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <a href="mailto:suporte@soloventures.com.br">
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar E-mail
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {equipe && (
          <Card className="max-w-4xl mx-auto mt-6">
            <CardHeader>
              <CardTitle>Informações da Equipe</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Nome</p>
                  <p className="font-medium">{equipe.nome}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Nicho</p>
                  <p className="font-medium">{equipe.niche || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Créditos</p>
                  <p className="font-medium">{equipe.limite_creditos + equipe.creditos_avulsos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Suporte;
