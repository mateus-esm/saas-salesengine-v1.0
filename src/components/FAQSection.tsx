import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Preciso ter experiência prévia para usar a plataforma?",
    answer: "Não! Nossa plataforma foi desenvolvida para ser intuitiva e fácil de usar. Oferecemos tutoriais completos, suporte dedicado e uma comunidade ativa para ajudá-lo em cada etapa. Mesmo que você nunca tenha vendido online, conseguirá resultados.",
  },
  {
    question: "Em quanto tempo verei resultados?",
    answer: "A maioria dos nossos alunos começa a ver os primeiros resultados entre 7 a 14 dias após implementar o método. Claro, os resultados variam de acordo com o nicho e a dedicação de cada pessoa, mas nosso sistema foi otimizado para gerar resultados rápidos.",
  },
  {
    question: "Funciona para qualquer tipo de negócio?",
    answer: "Sim! O método foi testado em mais de 50 nichos diferentes, desde e-commerce até serviços, infoprodutos e negócios locais. O sistema é adaptável e pode ser personalizado para qualquer tipo de oferta.",
  },
  {
    question: "E se eu não gostar? Existe garantia?",
    answer: "Oferecemos garantia incondicional de 7 dias. Se por qualquer motivo você não ficar satisfeito, basta enviar um e-mail e devolvemos 100% do seu investimento, sem perguntas ou burocracia.",
  },
  {
    question: "O acesso é vitalício mesmo?",
    answer: "Sim! Ao adquirir a Máquina Automática de Vendas, você terá acesso vitalício à plataforma, incluindo todas as atualizações futuras sem nenhum custo adicional.",
  },
  {
    question: "Quais formas de pagamento são aceitas?",
    answer: "Aceitamos cartão de crédito (em até 12x sem juros), PIX (com 5% de desconto), boleto bancário e PayPal. Escolha a opção que melhor se adapta às suas necessidades.",
  },
];

const FAQSection = () => {
  return (
    <section className="py-24 bg-card">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-gold text-sm font-semibold uppercase tracking-wider">
            Dúvidas frequentes
          </span>
          <h2 className="text-3xl md:text-5xl font-bold">
            Perguntas e{" "}
            <span className="text-gradient">Respostas</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Tire suas dúvidas antes de começar sua jornada de sucesso.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border border-border rounded-xl px-6 bg-background data-[state=open]:border-gold/30 transition-colors"
              >
                <AccordionTrigger className="text-left font-semibold text-lg hover:text-gold transition-colors py-6">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-6 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
