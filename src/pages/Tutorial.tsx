import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, MessageSquare, BarChart3, CreditCard, Users, Zap } from "lucide-react";

const Tutorial = () => {
  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            Tutorial <span className="text-primary">& Guia de Uso</span>
          </h1>
          <p className="text-sm text-foreground/70 mt-1 font-medium">
            Aprenda a dominar todas as funcionalidades da plataforma
          </p>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Quick Start Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <MessageSquare className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Central de Chat</CardTitle>
              <CardDescription>Gerencie conversas do WhatsApp</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Acesse a Central de Chat para supervisionar o agente IA, responder clientes e acompanhar conversas em tempo real.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <BarChart3 className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Dashboard</CardTitle>
              <CardDescription>Monitore sua performance</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Visualize KPIs como leads atendidos, reuniões agendadas e negócios fechados em tempo real.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CreditCard className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Créditos & Billing</CardTitle>
              <CardDescription>Gerencie seus créditos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Acompanhe o consumo de créditos, saldo disponível e histórico de uso do seu plano.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Accordion */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <CardTitle>Perguntas Frequentes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Como funciona o Chat e o Multi-atendimento?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    Acesse a <strong>Central de Chat</strong> para supervisionar o Agente IA. Você tem total controle para intervir, assumir conversas ou analisar a qualidade do atendimento em tempo real. Uma ferramenta de colaboração onde humanos e IA trabalham em sintonia para maximizar resultados.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger>Como interpretar os KPIs do Dashboard?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground mb-2">
                    O Dashboard apresenta métricas essenciais para acompanhar seu desempenho:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    <li><strong>Leads Atendidos:</strong> Total de contatos processados no período</li>
                    <li><strong>Reuniões Agendadas:</strong> Número de reuniões marcadas com potenciais clientes</li>
                    <li><strong>Negócios Fechados:</strong> Quantidade de contratos efetivados</li>
                    <li><strong>Valor Total:</strong> Soma do valor de todos os negócios fechados</li>
                    <li><strong>Taxa de Conversão:</strong> Percentual de sucesso em cada etapa do funil</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger>Como usar o CRM integrado?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">
                    O CRM possui um Pipeline visual no estilo Kanban onde você pode arrastar leads entre etapas. Também há uma visão de tabela com filtros avançados, edição inline e importação/exportação de CSV.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger>Quais são os planos disponíveis?</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 text-sm text-foreground/80">
                    <div>
                      <p className="font-semibold text-foreground mb-1">Solo Starter - R$ 200/mês</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>1.000 Créditos • Até 3 Usuários</li>
                        <li>Setup do Agente, Central de Chat, Pipeline (Visualização)</li>
                      </ul>
                    </div>
                    
                    <div>
                      <p className="font-semibold text-primary mb-1">Solo Scale - R$ 400/mês (Mais Popular)</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>3.000 Créditos • Até 5 Usuários</li>
                        <li>Dashboard Avançado, Gestão de Billing, Builder Mode (1h/mês)</li>
                      </ul>
                    </div>
                    
                    <div>
                      <p className="font-semibold text-foreground mb-1">Solo Pro - R$ 1.000/mês</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>10.000 Créditos • Usuários Ilimitados</li>
                        <li>Consultoria, Builder Mode Prioritário (3h/mês), Customizações</li>
                      </ul>
                    </div>
                    
                    <p className="mt-4 text-muted-foreground italic">
                      Todos os planos incluem atualizações contínuas e suporte da Solo Ventures.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5">
                <AccordionTrigger>Como funciona o consumo de créditos?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">
                    O consumo de créditos é baseado nas interações que os leads e clientes têm com o Agente IA e o modelo de linguagem utilizado. Modelos diferentes possuem custos variados. Acompanhe seu consumo na aba de Billing ou na página do Agente IA.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6">
                <AccordionTrigger>Preciso de suporte técnico. Como proceder?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">
                    Acesse a página de Suporte pelo menu ou clique no botão flutuante do WhatsApp para falar diretamente com nossa equipe. Estamos disponíveis para ajudar com dúvidas técnicas e orientações.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7">
                <AccordionTrigger>Qual o objetivo da plataforma?</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">
                    O objetivo é aumentar a performance de equipes com um Agente IA que trabalha na qualificação e atendimento dos clientes, e um CRM que ajuda a aumentar os resultados de negócios fechados. Cada membro da equipe tem seu próprio login.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Getting Started Guide */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              <CardTitle>Primeiros Passos</CardTitle>
            </div>
            <CardDescription>Comece a usar a plataforma em 3 etapas simples</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              <li className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Configure seu Perfil</h3>
                  <p className="text-sm text-muted-foreground">
                    Certifique-se de que seus dados estão atualizados e sua equipe está configurada corretamente.
                  </p>
                </div>
              </li>

              <li className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Explore o Dashboard</h3>
                  <p className="text-sm text-muted-foreground">
                    Familiarize-se com os KPIs e gráficos para entender sua performance atual.
                  </p>
                </div>
              </li>

              <li className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Comece a Usar o Chat</h3>
                  <p className="text-sm text-muted-foreground">
                    Acesse a Central de Chat para acompanhar o atendimento do Agente IA e interagir com seus clientes.
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Best Practices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              <CardTitle>Melhores Práticas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Monitore seu consumo de créditos regularmente para evitar interrupções no serviço</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Analise os KPIs semanalmente para identificar oportunidades de melhoria</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Mantenha o CRM atualizado para dados precisos no Dashboard</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Use o Agente IA para padronizar respostas e otimizar atendimentos</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Entre em contato com o suporte sempre que tiver dúvidas ou sugestões</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Tutorial;
