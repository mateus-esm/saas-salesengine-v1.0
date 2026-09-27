# Reconhecimento e decisões — SE-SUPPORT-001

## Evidências anteriores à implementação

- `Suporte.tsx`: somente WhatsApp, e-mail e informações da equipe; nenhum formulário ou consulta de tickets.
- `Admin.tsx`: oito abas (`nichos`, `equipes`, `usuarios`, `solo-instances`, `propostas`, `onboarding`, `faturamento`, `notificacoes`), selecionadas por `?tab=`. As abas maiores são componentes separados. O guard atual permite somente `super_admin`, diferença em relação ao contrato que exige também `owner` para tickets.
- Busca nas migrations e no schema tipado não encontrou tabelas de tickets de atendimento. Ocorrências de `ticket` referem-se a ticket médio de vendas.
- `useRole.ts`: hierarquia user < admin < owner < super_admin. `isOwner()` inclui owner e super_admin; `isAdmin()` também inclui admin. O acesso global ao suporte usará explicitamente owner/super_admin, nunca o admin comum da equipe.
- `notification_types` já declara audience e propósito; a migration posterior de roteamento também acrescentou audience `client`. O propósito `suporte` existe. `notify` valida o tipo, aplica templates, preferências, políticas e deduplicação, mas NÃO distribui automaticamente para administradores só porque audience é founder. A leitura de notifications está restrita à equipe e ao destinatário. O centro existente assina eventos da equipe da sessão.

## O que aceito

Implementar tickets como canal adicional, conversa persistente, listagem por equipe no cliente, visão global e filtros no Admin, respostas e alteração de status. Reutilizar componentes visuais, React Query, autenticação e notificações existentes. Migration exclusivamente aditiva; sem deploy, commit ou push.

## O que rejeito

Remover WhatsApp/e-mail; alterar comportamento das oito abas existentes; conceder acesso global ao papel admin comum; usar chave privilegiada no navegador; confiar no filtro da interface como autorização; alterar os motores, webhooks e artefatos excluídos do escopo. Não inventar baseline ou afirmar validação em produção.

## Modelo de dados

`support_tickets`: UUID, equipe_id, created_by, subject (1–200 caracteres, não vazio; interface remove espaços nas extremidades), description (1–10000), status (`aberto`, `em_atendimento`, `resolvido`, `fechado`), created_at e updated_at. Descrição inicial imutável no ticket; respostas em `support_ticket_messages`: UUID, ticket_id, author_id, author_kind (`cliente`/`suporte`, calculado no banco), body (1–10000), created_at. Separar mensagens evita sobrescrever um JSON concorrente, permite índices e mantém autoria e ordem cronológica. Respostas são acrescentadas, nunca editadas/apagadas pela aplicação. Não há anexos nesta entrega.

## RLS e privilégios

SELECT do ticket: equipe_id pertence ao perfil de auth.uid() OU `has_role(auth.uid(), 'owner')` OU `has_role(auth.uid(), 'super_admin')`. Mensagens herdam o acesso pelo ticket pai. INSERT de ticket exige equipe do próprio usuário e created_by = auth.uid(); INSERT de mensagem exige acesso ao pai e autoria da sessão. Colunas graváveis são explicitamente limitadas por GRANT, protegendo IDs, timestamps, equipe, autor e classificação da resposta. UPDATE de ticket é limitado à coluna status e à policy owner/super_admin. Não há DELETE ou UPDATE de mensagem concedido ao cliente.

O administrador atravessa equipes pela policy avaliada no PostgreSQL com seu JWT comum. A função existente `has_role` consulta user_roles com SECURITY DEFINER e search_path fixo; nenhuma chave service_role vai para o navegador. RPC nova e restrita lista somente ID/nome das equipes com tickets para os filtros de suporte, sem ampliar RLS de equipes. O owner recebe uma renderização exclusiva da aba Tickets, sem carregar ou renderizar as abas antigas. O super_admin mantém o fluxo existente, com a aba adicionada.

## Aviso ao administrador

Criar `support.ticket_created`, audience `founder`, purpose `suporte`, canal `in_app`. Trigger transacional chama `notify` uma vez por owner/super_admin com perfil e equipe, endereçando à equipe DO DESTINATÁRIO e a seu user_id. Assim o sino existente recebe o evento, sem expor o aviso aos demais membros e sem alterar policies de notifications. Deduplicação usa ticket + destinatário. Link abre `/admin?tab=tickets&ticket=<id>`. Audience sozinho não basta; por isso o fan-out é explícito no banco. Preferências e políticas existentes continuam respeitadas. Conta administrativa sem equipe não usa o centro existente e precisa de equipe associada para receber aviso; ainda pode consultar os tickets globais. Falha de notify aborta a criação, evitando confirmar ticket sem registrar seu aviso.

## Validação planejada

Baseline real de npm test antes de alterar src/migrations; comparar lint antes/depois. Rodar typecheck, lint, build, suíte completa e guard de marca explicitamente. Exercitar RLS em PostgreSQL local isolado com papéis authenticated/anon, duas equipes, owner e super_admin; nenhuma consulta ao banco remoto. Documentar limites do ambiente e etapas não executadas.

## Complementos encontrados na implementação

O menu Suporte estava restrito ao papel admin, embora a rota autenticada pudesse ser aberta por user. O item passa a aceitar user, mantendo a configuração `page_permissions.suporte` da equipe. O link administrativo aparece para owner e aponta diretamente para Tickets; o link do super_admin preserva o destino anterior.

Baseline concluído antes da alteração de código: npm test no ambiente herdado (`NODE_ENV=production`) terminou com 356 testes aprovados e 51 reprovados; 40 arquivos aprovados e 17 reprovados, de 57. A repetição em `NODE_ENV=test` terminou com 414 testes aprovados, nenhum teste reprovado e três arquivos com erro de coleta por ausência de variáveis de configuração. Lint inicial: 0 erros e 86 avisos. Os logs preservam as saídas reais, inclusive falhas.
