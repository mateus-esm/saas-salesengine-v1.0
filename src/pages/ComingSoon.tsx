import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Rocket, ArrowLeft, Sparkles, Construction } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ComingSoonProps {
    title: string;
    description: string;
    features?: string[];
}

const ComingSoon = ({ title, description, features }: ComingSoonProps) => {
    const navigate = useNavigate();

    return (
        <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/20">
            <Card className="max-w-lg w-full border-none shadow-2xl bg-gradient-to-b from-card to-card/80">
                <CardHeader className="text-center pb-4">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 w-fit">
                        <Construction className="h-12 w-12 text-primary animate-pulse" />
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <CardTitle className="text-2xl">{title}</CardTitle>
                        <Badge variant="secondary" className="animate-pulse">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Em Breve
                        </Badge>
                    </div>
                    <CardDescription className="text-base">{description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {features && features.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">
                                O que está por vir:
                            </p>
                            <ul className="space-y-2">
                                {features.map((feature, index) => (
                                    <li
                                        key={index}
                                        className="flex items-center gap-2 text-sm text-foreground/80"
                                    >
                                        <Rocket className="h-4 w-4 text-primary shrink-0" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="pt-4 flex flex-col gap-3">
                        <Button
                            variant="outline"
                            onClick={() => navigate(-1)}
                            className="w-full"
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                        <p className="text-xs text-center text-muted-foreground">
                            Fique ligado! Novidades chegando em breve.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

// Pre-configured pages
export const ToolkitPage = () => (
    <ComingSoon
        title="Toolkit"
        description="Acesso exclusivo a templates de automação, scripts de vendas e ferramentas growth."
        features={[
            "Templates de automação prontos para uso",
            "Scripts de vendas otimizados",
            "Ferramentas de growth hacking",
            "Integrações exclusivas",
            "Playbooks de prospecção",
        ]}
    />
);

export const ClubePage = () => (
    <ComingSoon
        title="Clube Solo"
        description="Área de membros para indicações, networking e benefícios exclusivos Solo."
        features={[
            "Programa de indicações com recompensas",
            "Networking com outros usuários",
            "Descontos e benefícios exclusivos",
            "Eventos e webinars VIP",
            "Acesso antecipado a novidades",
        ]}
    />
);

export default ComingSoon;
