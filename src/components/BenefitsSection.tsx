import { TrendingUp, Clock, Target, Zap, BarChart3, Shield } from "lucide-react";

const benefits = [
  {
    icon: TrendingUp,
    title: "Vendas Automáticas",
    description: "Sistema que gera vendas 24/7 sem sua presença constante. Lucre enquanto dorme.",
  },
  {
    icon: Clock,
    title: "Economia de Tempo",
    description: "Automatize tarefas repetitivas e foque no que realmente importa para seu negócio.",
  },
  {
    icon: Target,
    title: "Leads Qualificados",
    description: "Atraia e converta apenas clientes com real potencial de compra.",
  },
  {
    icon: Zap,
    title: "Resultados Rápidos",
    description: "Veja as primeiras vendas em até 7 dias com nosso método comprovado.",
  },
  {
    icon: BarChart3,
    title: "Escala Infinita",
    description: "Sistema preparado para crescer junto com seu negócio sem limites.",
  },
  {
    icon: Shield,
    title: "Suporte Premium",
    description: "Equipe especializada pronta para ajudar em cada etapa da sua jornada.",
  },
];

const BenefitsSection = () => {
  return (
    <section className="py-24 bg-background relative">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-gold text-sm font-semibold uppercase tracking-wider">
            Por que escolher nossa solução
          </span>
          <h2 className="text-3xl md:text-5xl font-bold">
            Tudo que você precisa para{" "}
            <span className="text-gradient">escalar suas vendas</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Nossa plataforma oferece todas as ferramentas necessárias para transformar 
            seu negócio em uma verdadeira máquina de vendas.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <div
              key={benefit.title}
              className="group p-8 rounded-2xl bg-card border border-border hover:border-gold/30 transition-all duration-300 hover:shadow-glow"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mb-6 group-hover:bg-gold/20 transition-colors">
                <benefit.icon className="w-7 h-7 text-gold" />
              </div>
              <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;
