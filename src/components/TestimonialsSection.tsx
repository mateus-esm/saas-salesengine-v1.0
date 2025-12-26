import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Carlos Eduardo",
    role: "E-commerce de Moda",
    content: "Em apenas 30 dias, triplicamos nossas vendas. O sistema é incrível e o suporte é excepcional. Melhor investimento que fiz para o meu negócio!",
    rating: 5,
    result: "+300% em vendas",
  },
  {
    name: "Amanda Silva",
    role: "Consultora de Marketing",
    content: "Finalmente consegui escalar meu negócio sem trabalhar mais horas. A automação mudou minha vida e agora tenho tempo para minha família.",
    rating: 5,
    result: "R$50k/mês",
  },
  {
    name: "Roberto Santos",
    role: "Infoprodutor",
    content: "Estava cético no início, mas os resultados falam por si. Saí de R$5k para R$35k mensais em 3 meses seguindo o método à risca.",
    rating: 5,
    result: "7x mais lucro",
  },
];

const TestimonialsSection = () => {
  return (
    <section className="py-24 bg-card relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gold/5 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-gold text-sm font-semibold uppercase tracking-wider">
            Histórias de sucesso
          </span>
          <h2 className="text-3xl md:text-5xl font-bold">
            O que nossos clientes{" "}
            <span className="text-gradient">estão dizendo</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Mais de 2.500 empreendedores já transformaram seus negócios com nossa metodologia.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className="p-8 rounded-2xl bg-background border border-border hover:border-gold/30 transition-all duration-300 flex flex-col"
            >
              {/* Rating */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-gold fill-gold" />
                ))}
              </div>

              {/* Content */}
              <p className="text-foreground/90 leading-relaxed mb-6 flex-1">
                "{testimonial.content}"
              </p>

              {/* Result badge */}
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-gold/10 text-gold text-sm font-semibold mb-6 self-start">
                {testimonial.result}
              </div>

              {/* Author */}
              <div className="flex items-center gap-4 pt-6 border-t border-border">
                <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center text-gold font-bold text-lg">
                  {testimonial.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
