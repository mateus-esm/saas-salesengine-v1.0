/**
 * SE-DOCS-001 — conteúdo canônico v1 da Central de Ajuda.
 *
 * Este arquivo é o ESPELHO do seed da migration
 * `supabase/migrations/20260926000300_sedocs001_help_center.sql`.
 * Os dois precisam ter os mesmos slugs e o mesmo texto: o banco é a fonte
 * primária em runtime (atualizável sem deploy) e este arquivo é o fallback
 * usado quando o Supabase está inacessível.
 *
 * REGRA: ao publicar uma correção, atualize o banco (efeito imediato, sem
 * deploy) E este arquivo (para o próximo build levar o texto novo no
 * fallback). Nunca cite aqui a marca do provider de IA — diga "provedor de IA".
 */

export interface HelpArticleSeed {
  slug: string;
  /** Rótulo do módulo no menu, para agrupar no índice. */
  module: string;
  title: string;
  summary: string;
  body_md: string;
  order: number;
}

export const HELP_ARTICLES_SEED: HelpArticleSeed[] = [
  {
    slug: "primeiros-passos",
    module: "Comece por aqui",
    title: "Primeiros passos na plataforma",
    summary: "Configure seu perfil, explore o Dashboard e acompanhe o Chat em 3 etapas.",
    order: 1,
    body_md: `## O que é

Este guia leva você do primeiro login até a operação diária em 3 etapas. Siga na ordem.

## Para que serve

Garantir que sua equipe, seus números e seu atendimento estejam prontos antes de operar de verdade.

## Passo a passo

1. **Confira seu perfil e sua equipe.** Seus dados e os dados da equipe aparecem na página de Suporte (cartão "Informações da Equipe"). Se algo estiver errado, fale com o administrador da sua conta.
2. **Explore o Dashboard.** Abra o menu Dashboard e olhe a aba Visão geral. Se aparecer o aviso "Mapear etapas", peça ao administrador para mapear as etapas do funil — sem isso os números ficam vazios.
3. **Acompanhe o Chat.** Abra a Central de Chat e observe como o agente de IA atende. Você pode intervir a qualquer momento com o botão Assumir.

## Erros comuns

- **Pular o mapeamento de etapas** e achar que o Dashboard está quebrado (ele só mostra eventos do período nas etapas mapeadas).
- **Sair clicando sem salvar** nas telas de configuração: botões Salvar ficam desabilitados até haver alteração — confira antes de sair.
- **Não ser administrador e procurar telas de configuração** (AI Studio, Webhooks, Billing): elas só aparecem para admin.`,
  },
  {
    slug: "inicio-copiloto",
    module: "Comece por aqui",
    title: "Início e Copiloto",
    summary: "A tela de abertura: Copiloto ou grade de módulos, e como navegar.",
    order: 2,
    body_md: `## O que é

A tela Início (\`/home\`) é a abertura do aplicativo. Ela tem dois modos: se a sua equipe tem o agente de CRM ativado, você vê o **Copiloto**; senão, vê uma **grade de cartões** com os módulos (Central de Chat, Pipeline CRM, Dashboard, AI Studio, Webhooks, Billing, Central de Ajuda).

## Para que serve

É o ponto de partida de todo dia: daqui você chega a qualquer módulo em um clique, ou conversa com o Copiloto.

## Passo a passo

1. Abra o menu **Início**.
2. Se aparecer o Copiloto, interaja por ali — os módulos continuam abaixo.
3. Se aparecer a grade, clique no cartão do módulo desejado (alguns abrem em nova aba).
4. O endereço antigo \`/copiloto\` redireciona automaticamente para cá — atualize seus favoritos.

## Erros comuns

- **Clicar em Toolkit ou Clube Solo e nada acontecer**: estão com selo "Em Breve" e ainda não abrem — é esperado.
- **Não ver AI Studio, Webhooks ou Billing na grade**: esses cartões só aparecem para administradores.
- **Esperar o Copiloto e ver só cartões** (ou o inverso): depende de uma configuração da equipe, fale com o administrador.`,
  },
  {
    slug: "dashboard",
    module: "Dashboard",
    title: "Dashboard: lendo seus números",
    summary: "KPIs, funil, time, canais e relatórios agendados no WhatsApp.",
    order: 10,
    body_md: `## O que é

O Dashboard (\`/dashboard\`) é a área de inteligência comercial, com 5 abas: **Visão geral, Funil, Time, Canais e Relatórios**. O filtro de período e pipeline fica no topo e vale para todas as abas (menos Relatórios).

## Para que serve

Responder "como estamos vendendo": receita, funil, desempenho por pessoa e por canal de aquisição.

## Passo a passo

1. Abra **Dashboard** e escolha o **período** e o **pipeline** no filtro do topo (padrão: últimos 30 dias).
2. Na **Visão geral**, leia os KPIs (Receita ganha, Pipeline aberto, Ticket médio, Taxa de ganho...) e use **Personalizar** para ligar/desligar cartões.
3. Abra **Funil** para o consolidado do período e a receita por produto (negócio sem item aparece como "Sem item").
4. Abra **Time** para receita ganha e carga aberta por responsável (sem permissão de time, você vê "Seus números").
5. Abra **Canais** para comparar canal de aquisição × canal de atendimento e retorno por campanha.
6. Em **Relatórios** (só admin), crie com **Novo relatório** um resumo diário/semanal/mensal enviado no WhatsApp: escolha horário, seções e destinatários e **ative o switch**.

## Erros comuns

- **Achar que o funil mostra a posição atual**: ele mostra eventos do período filtrado, não o retrato de agora.
- **Trocar de aba esperando o filtro reiniciar**: o filtro é compartilhado e continua o mesmo.
- **Agendar relatório sem seção ou com o switch desligado**: o relatório sai vazio ou nunca é enviado.
- **Comparar pipelines diferentes como se fossem um só** na aba Funil.`,
  },
  {
    slug: "chat",
    module: "Chat",
    title: "Chat: atendimento com o agente de IA",
    summary: "Inbox multicanal, assumir conversas, notas, tarefas e janela de 24h.",
    order: 20,
    body_md: `## O que é

A Central de Chat (\`/chat\`) é o inbox de atendimento em WhatsApp, Instagram, Telegram, Web e Messenger. Tem 3 colunas: **lista de conversas**, **thread da conversa** e **painel do CRM** (Notas, Tarefas, Histórico).

## Para que serve

Supervisionar o agente de IA, responder clientes e assumir conversas quando preciso — humanos e IA trabalhando juntos.

## Passo a passo

1. Na lista, use a busca ("Buscar conversas..."), as abas **Ativas/Arquivadas** e os filtros de canal, responsável e funil para achar a conversa.
2. Clique na conversa para abrir o histórico. Use **Ir para o final** para pular para as mensagens novas.
3. Digite e envie com Enter: **enviar mensagem já marca a conversa como atendida por agente** (o agente sai do loop sozinho).
4. Para devolver ao agente, clique em **Devolver Controle ao Agente**.
5. No painel direito, registre **Notas** (Salvar Notas), crie **Tarefas** (Adicionar) e consulte o **Histórico**.
6. Use **Sincronizar** para atualizar a lista, **Atribuir** para definir responsável, e **Arquivar/Reabrir** para organizar (Arquivar não apaga; **Remover conversa** apaga).

## Erros comuns

- **Tentar enviar com o selo "Janela Fechada"**: fora da janela de 24h o envio falha — é regra do canal, não bug.
- **Não perceber que digitar tira o agente do loop**: depois de intervir, devolva o controle se quiser que o agente volte a atender.
- **Fechar as colunas Inbox/CRM e não achar como reabrir**: procure os controles de expandir nas bordas da tela.
- **Confundir Arquivar com Remover conversa**: arquivar organiza, remover apaga.`,
  },
  {
    slug: "crm",
    module: "CRM",
    title: "CRM: pipeline, contatos e operação",
    summary: "As 9 abas do CRM e o Kanban de oportunidades.",
    order: 30,
    body_md: `## O que é

O CRM (\`/crm\`) é o hub de relacionamento, com 9 abas: **Pipeline, Base de Contatos, Empresas, Imóveis, Catálogo, Campanhas, Tarefas, Tabelas e Agenda**. A aba pode ser aberta direto pelo endereço (\`/crm?tab=tarefas\`, por exemplo).

## Para que serve

Gerenciar oportunidades no Kanban, cadastros, campanhas, tarefas e tabelas customizadas — tudo num lugar só.

## Passo a passo

1. Abra o **CRM** e escolha a aba (no celular, arraste a barra de abas para o lado).
2. Na aba **Pipeline**, use o Kanban: arraste oportunidades entre etapas; use as sub-abas **Kanban/Leads/Copilot**.
3. Se aparecer a tela vazia ("sem pipeline ativa"), clique em **Criar Pipeline** — você vai para a tela de configuração.
4. Nas demais abas, use filtros, edição e importação/exportação de CSV onde disponível.
5. A aba antiga de tarefas agora vive aqui: o endereço \`/tasks\` redireciona para \`/crm?tab=tasks\`.

## Erros comuns

- **Procurar o Copilot dentro do CRM**: ele foi movido para a abertura (\`/home\`).
- **Achar que perdeu filtros ao trocar de aba**: trocar de aba limpa os filtros e links profundos — é o comportamento esperado.
- **Não ver todas as abas no celular**: a barra rola horizontalmente.`,
  },
  {
    slug: "pipeline-config",
    module: "CRM",
    title: "Configurando pipelines e etapas",
    summary: "Criar pipelines, editar etapas, metas e campos — sem medo de quebrar.",
    order: 31,
    body_md: `## O que é

A tela de configuração de pipelines (\`/pipeline\`) é onde o administrador desenha o processo de venda: pipelines, etapas, metas, origem e campos do contato.

## Para que serve

Criar um funil que reflita seu processo real, para o Kanban e o Dashboard mostrarem números confiáveis.

## Passo a passo

1. Clique em **Nova Pipeline**, escolha **Em branco** ou um modelo, informe o **Nome** (obrigatório) e clique em **Criar**.
2. Selecione a pipeline na lista (abas **Ativas/Arquivadas**) e abra as seções do editor: Identidade, Natureza, **Etapas**, Metas, Automações, Origem & Canal, Campos do Contato, Geral.
3. Edite e clique em **Salvar** (o botão só ativa quando há alteração — **sair sem salvar perde a edição**).
4. Use **Tornar padrão** para a pipeline principal; **Arquivar** para guardar sem apagar.

## Erros comuns

- **Editar e sair sem clicar em Salvar**: o rascunho pode reaparecer e confundir.
- **Excluir em vez de Arquivar**: excluir apaga, arquivar guarda — prefira arquivar.
- **Nome vazio ou cadência inválida**: o sistema avisa ("Nome é obrigatório", "Cadência deve ser um número inteiro maior que zero").
- **Procurar automações prontas na seção Automações**: ela aponta para a aba Copilot — a automação se configura lá.`,
  },
  {
    slug: "ai-studio",
    module: "AI Studio",
    title: "AI Studio: configurando o cérebro do agente",
    summary: "Modelo, Knowledge Base, Skills, canais e configurações do agente.",
    order: 40,
    body_md: `## O que é

O AI Studio (\`/ai-studio\`, só admin) configura o agente de IA em 5 abas: **Uso & Dados, Knowledge Base, Skills, Canais e Configurações**.

## Para que serve

Definir como o agente fala, o que ele sabe, o que ele faz sozinho e por onde ele atende.

## Passo a passo

1. **Uso & Dados**: veja o consumo por modelo e escolha o **modelo ativo** no seletor. Modelos diferentes têm custos diferentes — acompanhe aqui.
2. **Knowledge Base**: ensine o agente em 3 pastas — **Perfil** (nome, tom de voz, persona, objetivos, restrições, quando escalar para humano; use o assistente ou o texto livre), **Empresa** (dados do negócio) e **Treinamento** (blocos de texto, site, vídeo, documentos).
3. **Skills**: crie gatilhos — quando o cliente disser X, o agente dispara webhook, ação no sistema ou resposta fixa.
4. **Canais**: conecte WhatsApp (QR code), Instagram, Telegram, Widget Web, Messenger e outros. Acompanhe o status (conectado/desconectado) e exclua canais inativos.
5. **Configurações**: ajuste **Conversa**, **Ações de inatividade**, **Webhooks** e **Regras de transferência** (quando passar para humano).

## Erros comuns

- **Salvar o perfil a partir de tela em branco**: a tela carrega o comportamento atual — se abrir vazia e salvar, você apaga a configuração real. Recarregue se desconfiar.
- **Treinar sem salvar / treinar demais de uma vez**: salve por pasta e teste no Chat antes do próximo lote.
- **Trocar de modelo e estranhar o custo**: cada modelo tem preço próprio — confira o consumo após a troca.
- **Canal desconectado e agente "sumido"**: confira o status na aba Canais antes de mexer no resto.`,
  },
  {
    slug: "webhooks",
    module: "Integrações",
    title: "Webhooks: conectando sistemas externos",
    summary: "Receber leads de fora (entrada), avisar outros sistemas (saída) e auditar logs.",
    order: 50,
    body_md: `## O que é

A tela Webhooks (\`/webhooks\`, só admin) conecta sistemas externos ao CRM em 3 abas: **Entrada, Saída e Logs**.

## Para que serve

Receber leads e eventos de outros sistemas (entrada) e avisar outros sistemas quando algo acontece no CRM (saída).

## Passo a passo

1. Na aba **Entrada**, copie a URL do webhook do CRM (com o segredo) ou do endpoint do provedor e cole no sistema de origem. Há ainda o formato inbound com mapeamento de campos.
2. Na aba **Saída**, clique em **Novo Webhook**, escolha o **evento gatilho** e a **URL** de destino, salve e ligue o **switch** para ativar.
3. Na aba **Logs**, confira as execuções: selo de **Erro** ou HTTP fora do 2xx indica falha no destino.

## Erros comuns

- **Webhook inativo não recebe nada**: confira o switch antes de culpar a origem.
- **URL antiga apontando para o ambiente errado**: as URLs derivam do endereço atual do backend — se algo mudou, copie de novo.
- **Falha aparece nos Logs, não na origem**: o diagnóstico é sempre pela aba Logs.`,
  },
  {
    slug: "outreach",
    module: "Integrações",
    title: "Outreach: mensagens automáticas e sequências",
    summary: "Mensagem de abertura, sequências de follow-up, janela de envio e freios.",
    order: 51,
    body_md: `## O que é

O Outreach (\`/outreach\`, só admin) configura mensagens automáticas: **mensagem de abertura** para leads novos e **sequências** de follow-up com passos espaçados no tempo.

## Para que serve

Nunca deixar um lead sem resposta: o primeiro contato e os lembretes saem sozinhos, com freios para não incomodar.

## Passo a passo

1. Em **Canal e freios**, escolha o provedor e a linha, defina a **janela de envio** (ex.: 08h–20h), o fuso e o **máximo por hora**, e salve.
2. Em **Mensagem de abertura**, escreva o texto e **marque as portas** que disparam (sem porta marcada, nada dispara).
3. Em **Sequências**, crie com nome, **exatamente 1 porta de entrada** e passos com atraso em minutos; salve e ative.

## Erros comuns

- **Salvar sem provedor/linha** ou **abertura ativa sem texto ou sem porta**: nada é enviado e parece "quebrado".
- **Sequência ativa na mesma porta suplanta a abertura**: se as duas disputam a porta, vale a sequência — desative uma delas.
- **Porta indisponível na lista**: portas de origem apagada/inativa ficam ocultas de propósito.
- **Editar a regra e "criar outra"**: volte à tela e confira se abriu a regra salva antes de ajustar — salvar edita a regra aberta.`,
  },
  {
    slug: "billing",
    module: "Billing",
    title: "Billing: plano, créditos e faturas",
    summary: "Visão geral, faturas, recarga de créditos, plano e dados de cobrança.",
    order: 60,
    body_md: `## O que é

O Billing (\`/billing\`, só admin) responde 4 perguntas: **o que tenho, quanto usei, o que devo e o que acontece se não pagar**. Abas: **Visão geral, Faturas, Créditos, Plano e Dados de cobrança**.

## Para que serve

Acompanhar plano, saldo de créditos, faturas e manter os dados de cobrança em dia para não interromper o serviço.

## Passo a passo

1. Na **Visão geral**, confira o **plano atual** e a próxima cobrança, os dois saldos de crédito (**WhatsApp e Copilot — são pools separados**) e a **fatura em aberto**.
2. Em **Faturas**, veja o histórico e clique em **Pagar** na fatura aberta.
3. Em **Créditos**, confira o saldo e faça **recarga** antes de zerar.
4. Em **Plano**, compare tiers e adicionais; em **Dados de cobrança**, mantenha CPF/CNPJ e endereço atualizados.
5. Repare no aviso de situação do contrato no topo: ele aparece em todas as abas quando há risco de inadimplência.

## Erros comuns

- **Somar os dois pools de crédito**: saldo saudável no Copilot não significa que o atendimento (WhatsApp) está coberto — acompanhe os dois.
- **Achar que conversar com a equipe gasta crédito**: só ações de IA consomem; o chat interno nunca consome.
- **Deixar a fatura vencer e estranhar limitações**: o aviso no topo avisa antes — pague em Faturas.`,
  },
  {
    slug: "notificacoes",
    module: "Conta",
    title: "Notificações",
    summary: "Histórico de avisos, severidades e como marcar como lidas.",
    order: 70,
    body_md: `## O que é

A página de notificações (\`/notificacoes\`) guarda o histórico de avisos (informativos, sucessos, alertas e críticos), agrupados por dia, até 100 itens.

## Para que serve

Não perder avisos importantes — como alertas de cobrança — que somem rápido demais em pop-ups.

## Passo a passo

1. Abra **Notificações** pelo menu ou pelo sino.
2. Clique em uma notificação para marcá-la como lida (algumas levam você até a tela relacionada).
3. Use **Marcar todas como lidas** para zerar a contagem.

## Erros comuns

- **Clicar e "nada acontecer"**: algumas notificações só marcam como lida, sem destino — é esperado.
- **Procurar avisos muito antigos**: a lista mostra os 100 mais recentes.`,
  },
  {
    slug: "suporte",
    module: "Conta",
    title: "Suporte: falando com a equipe",
    summary: "WhatsApp, e-mail e os dados da sua equipe num lugar só.",
    order: 71,
    body_md: `## O que é

A página Suporte (\`/suporte\`) reúne os canais de atendimento humano: **WhatsApp** (com o nome da sua empresa na mensagem) e **e-mail**, além do cartão **Informações da Equipe** (nome, nicho, créditos).

## Para que serve

Pedir ajuda quando esta Central não resolveu — e conferir os dados da conta ao abrir o chamado.

## Passo a passo

1. Tente primeiro buscar nesta Central de Ajuda (menu **Central de Ajuda**).
2. Se não resolveu, abra **Suporte** e clique em **Abrir WhatsApp** ou **Enviar E-mail**.
3. Confira o cartão da equipe antes de chamar: nome, nicho e saldo de créditos ajudam o atendimento.

## Erros comuns

- **Chamar o suporte antes de olhar a Central**: a maioria das dúvidas operacionais está respondida aqui, mais rápido.
- **Cartão da equipe vazio**: aparece só quando há equipe vinculada ao seu usuário.`,
  },
  {
    slug: "toolkit-clube",
    module: "Conta",
    title: "Toolkit e Clube Solo (Em Breve)",
    summary: "O que vem por aí: automações prontas e comunidade.",
    order: 72,
    body_md: `## O que é

**Toolkit** (templates e scripts de automação) e **Clube Solo** (indicações, networking, benefícios) aparecem no menu com o selo **Em Breve**: ainda não estão disponíveis.

## Para que serve (quando lançar)

Acelerar a operação com automações prontas (Toolkit) e trocar experiência com outras operações (Clube Solo).

## Passo a passo

1. Por enquanto, apenas acompanhe: as páginas mostram o que está previsto.
2. Use o botão **Voltar** para retornar.

## Erros comuns

- **Achar que é erro de permissão**: não é — ninguém tem acesso ainda, é lançamento futuro.`,
  },
  {
    slug: "faq",
    module: "Conta",
    title: "Perguntas frequentes",
    summary: "Créditos, planos, objetivo da plataforma e multiatendimento.",
    order: 73,
    body_md: `## Como funciona o Chat e o multiatendimento?

A Central de Chat supervisiona o agente de IA: você intervém, assume conversas ou analisa a qualidade em tempo real. Humanos e IA trabalham juntos para maximizar resultados.

## Como funcionam os créditos?

O consumo é baseado nas interações dos leads/clientes com o agente de IA e no modelo utilizado — modelos diferentes custam diferente. Acompanhe em Billing. O chat com sua equipe nunca consome créditos.

## Quais são os planos?

Há três tiers (Starter, Scale e Pro), com créditos, usuários e recursos progressivos. Veja detalhes e preços atuais na aba **Plano** do Billing — os valores exibidos lá valem mais que qualquer tabela impressa.

## Qual o objetivo da plataforma?

Aumentar a performance comercial: um agente de IA que qualifica e atende, mais um CRM que organiza e fecha negócios. Cada membro da equipe tem seu próprio login.

## Preciso de suporte humano?

Abra a página **Suporte** ou use o botão flutuante de WhatsApp. Mas tente primeiro esta Central — a resposta costuma estar aqui.`,
  },
];
