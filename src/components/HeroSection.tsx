import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-hero overflow-hidden">
      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gold/5 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border text-sm text-muted-foreground animate-fade-up"
            style={{ animationDelay: '0.1s' }}
          >
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            +2.500 empreendedores já transformaram seus negócios
          </div>

          {/* Main headline */}
          <h1 
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight animate-fade-up"
            style={{ animationDelay: '0.2s' }}
          >
            Transforme Seu Negócio em Uma{" "}
            <span className="text-gradient">Máquina Automática</span>{" "}
            de Vendas
          </h1>

          {/* Subheadline */}
          <p 
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-up"
            style={{ animationDelay: '0.3s' }}
          >
            O método comprovado que gera vendas no piloto automático 24 horas por dia, 
            7 dias por semana. Mesmo enquanto você dorme.
          </p>

          {/* CTA Buttons */}
          <div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-fade-up"
            style={{ animationDelay: '0.4s' }}
          >
            <Button variant="hero" size="xl">
              Quero Começar Agora
              <ArrowRight className="ml-2" />
            </Button>
            <Button variant="outline" size="lg" className="gap-2">
              <PlayCircle className="w-5 h-5" />
              Ver Demonstração
            </Button>
          </div>

          {/* Trust indicators */}
          <div 
            className="flex flex-wrap items-center justify-center gap-8 pt-12 text-sm text-muted-foreground animate-fade-up"
            style={{ animationDelay: '0.5s' }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              Garantia de 7 dias
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              Suporte especializado
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              Acesso vitalício
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
