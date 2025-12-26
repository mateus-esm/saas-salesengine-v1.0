import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Clock, HeadphonesIcon } from "lucide-react";

const FinalCTASection = () => {
  return (
    <section className="py-24 bg-gradient-hero relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gold/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Urgency badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/20 text-gold text-sm font-semibold animate-pulse-slow">
            <Clock className="w-4 h-4" />
            Oferta por tempo limitado
          </div>

          {/* Main headline */}
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight">
            Não deixe para depois o{" "}
            <span className="text-gradient">sucesso que você merece</span>
          </h2>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Milhares de empreendedores já transformaram seus negócios. 
            Agora é a sua vez de fazer parte dessa revolução.
          </p>

          {/* CTA Button */}
          <div className="pt-4">
            <Button variant="hero" size="xl" className="shadow-glow">
              Quero Começar Minha Transformação
              <ArrowRight className="ml-2" />
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-8 pt-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="w-5 h-5 text-gold" />
              <span>Compra 100% segura</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-5 h-5 text-gold" />
              <span>Garantia de 7 dias</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <HeadphonesIcon className="w-5 h-5 text-gold" />
              <span>Suporte 24/7</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTASection;
