import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Sparkles } from "lucide-react";

const features = [
  "Acesso completo à plataforma",
  "Mais de 50 templates prontos",
  "Automação de e-mail marketing",
  "Funis de vendas ilimitados",
  "Integração com 100+ ferramentas",
  "Suporte prioritário 24/7",
  "Comunidade exclusiva VIP",
  "Atualizações vitalícias",
  "Bônus: Curso de Copywriting",
  "Bônus: Mentoria em Grupo",
];

const PricingSection = () => {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gold/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-gold text-sm font-semibold uppercase tracking-wider">
            Oferta especial por tempo limitado
          </span>
          <h2 className="text-3xl md:text-5xl font-bold">
            Invista no seu{" "}
            <span className="text-gradient">futuro hoje</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Aproveite condições exclusivas disponíveis apenas nesta página.
          </p>
        </div>

        {/* Pricing card */}
        <div className="max-w-xl mx-auto">
          <div className="relative p-10 rounded-3xl bg-card border-2 border-gold/30 shadow-glow">
            {/* Popular badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-gold text-primary-foreground text-sm font-semibold">
                <Sparkles className="w-4 h-4" />
                Mais Popular
              </div>
            </div>

            {/* Pricing */}
            <div className="text-center mb-8 pt-4">
              <p className="text-muted-foreground mb-2">
                <span className="line-through text-lg">De R$ 1.997,00</span>
              </p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-2xl text-muted-foreground">R$</span>
                <span className="text-6xl font-bold text-gradient">497</span>
                <span className="text-muted-foreground">,00</span>
              </div>
              <p className="text-gold mt-2 font-medium">
                ou 12x de R$ 49,70 sem juros
              </p>
            </div>

            {/* Features list */}
            <ul className="space-y-4 mb-10">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-gold" />
                  </div>
                  <span className="text-foreground/90">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA Button */}
            <Button variant="cta" size="xl" className="w-full text-lg">
              Garantir Minha Vaga Agora
              <ArrowRight className="ml-2" />
            </Button>

            {/* Guarantee */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              🔒 Pagamento 100% seguro • Garantia de 7 dias
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
