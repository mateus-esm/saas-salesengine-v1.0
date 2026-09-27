# Implementação — SE-SUPPORT-001

## Entrega

Suporte e Admin agora compartilham tickets persistentes. O cliente abre assunto/descrição, consulta os tickets da própria equipe, acompanha status e respostas e pode complementar a conversa. WhatsApp, e-mail e informações da equipe permanecem na tela.

A aba Tickets, em componente próprio, lista solicitações de todas as equipes para owner/super_admin, filtra por equipe/status, abre a conversa pelo link e permite responder ou alterar o status. A lista usa páginas de 25 tickets; a conversa carrega respostas anteriores sob demanda. Consultas são atualizadas a cada 15 segundos e depois das gravações; também há atualização manual. Formulários têm limites, estados de envio, mensagens de erro e preservam o texto quando o envio falha.

O super_admin mantém as oito abas anteriores. O owner recebe somente a aba Tickets, sem executar as consultas nem montar os componentes das abas antigas. Seu link administrativo aponta para `/admin?tab=tickets`. O item Suporte passa a aceitar o papel user, respeitando a configuração de visibilidade da equipe.

Não houve commit, push, aplicação de migration remota ou deploy. Os arquivos estão na branch de tarefa do worktree.

## Arquivos de aplicação e banco

| Arquivo | Alteração |
| --- | --- |
| `src/pages/Suporte.tsx` | Acrescenta tickets, preservando os canais atuais. |
| `src/pages/Admin.tsx` | Acrescenta aba/URL de tickets e renderização exclusiva para owner. |
| `src/components/AppSidebar.tsx` | Acesso ao suporte para user e link de tickets para owner. |
| `src/components/admin/support/TicketsTab.tsx` | Nova aba com controle de acesso owner/super_admin. |
| `src/components/support/SupportTickets.tsx` | Formulários, filtros, paginação, lista e conversa compartilhados. |
| `src/hooks/useSupportTickets.ts` | Consultas tipadas, escopo de equipe, cache por identidade e atualização. |
| `src/integrations/supabase/types.ts` | Tipos das tabelas e RPC novas; sem regenerar contratos antigos. |
| `src/components/support/SupportTickets.test.tsx` | Cinco testes de criação, erro, resposta, filtros/status e ausência de acesso. |
| `src/pages/AdminSupportAccess.test.tsx` | Dois testes: owner somente em Tickets e admin comum sem acesso global. |
| `supabase/migrations/20260927000100_sesupport001_tickets.sql` | Tabelas, índices, RLS, privilégios, triggers, RPC e tipo de notificação. |
| `supabase/tests/sesupport001_tickets.test.sql` | Ensaio transacional de isolamento, autoria, status, notificações e privilégios. |

Nenhum arquivo dos motores, funções e artefatos excluídos do escopo foi alterado. Nenhuma aba antiga teve suas operações modificadas. `useRole.ts` foi lido e reutilizado, sem alteração.

## Decisões e segurança

### Modelo de dados

`support_tickets` guarda UUID, equipe, criador, assunto, descrição inicial, status e datas. Status: aberto, em_atendimento, resolvido e fechado. A descrição inicial é imutável pela aplicação. Respostas ficam em `support_ticket_messages`, com UUID, ticket, autor, classificação da autoria, texto e data. Linhas separadas evitam sobrescrita concorrente de histórico em JSON e permitem paginação. Mensagens não podem ser editadas/apagadas pela aplicação. Os status classificam o andamento; não bloqueiam complementos.

Índices atendem equipe/data, status/data, ordenação global e ticket/data das mensagens. Limites de assunto e texto também são verificados pelo banco. A classificação cliente/suporte e os timestamps são determinados no servidor.

### RLS e privilégios

SELECT de tickets permite equipe presente no perfil de `auth.uid()`. Uma policy independente acrescenta acesso global somente por `has_role(auth.uid(), 'owner')` ou `has_role(auth.uid(), 'super_admin')`. Admin comum continua restrito à própria equipe. Mensagens exigem acesso ao ticket pai, submetido à RLS.

Criar ticket exige equipe própria, autoria da sessão e status aberto. Responder exige acesso ao pai e autoria da sessão. GRANTs de coluna permitem INSERT apenas dos campos do formulário e UPDATE apenas de status; a policy de UPDATE exige owner/super_admin. Nem um administrador pode mover tickets entre equipes, forjar autor ou reescrever histórico por essas operações. Não há DELETE concedido. Funções internas de trigger não têm execução pública.

O navegador usa a sessão autenticada normal. O acesso global acontece na policy do PostgreSQL; nenhuma chave service_role foi acrescentada. A RPC `support_ticket_teams` retorna somente ID/nome das equipes com tickets após verificar owner/super_admin, sem alterar policies de equipes. O filtro adicional da consulta em `/suporte` mantém até administradores restritos à própria equipe nessa tela; a autorização real permanece no banco.

### Notificações

O tipo `support.ticket_created` usa purpose suporte, audience founder e canal in_app. Um trigger transacional chama a função existente `public.notify` uma vez por owner/super_admin com perfil/equipe. Cada aviso pertence à equipe do destinatário e tem user_id explícito; a RLS e a assinatura do sino existente continuam funcionando sem mudanças. A deduplicação usa ticket + destinatário; o link abre a conversa.

Essa distribuição é necessária porque audience não faz fan-out em notify. Políticas, preferências e templates existentes continuam respeitados. Não há canal paralelo ou alteração no dispatcher. Falha no registro da notificação aborta a criação do ticket na mesma transação.

## Validações executadas

Os logs preservam saídas reais dos runners, no idioma emitido pelas ferramentas. Nenhum resultado foi estimado.

| Validação | Resultado real |
| --- | --- |
| Primeira tentativa de npm test antes da mudança | Vitest ausente. Dependências instaladas com `npm ci --include=dev --cache .npm-cache`; o ambiente omitia devDependencies. |
| Baseline npm test antes da mudança de código | **356 aprovados, 51 reprovados**; 40 arquivos aprovados e 17 reprovados, de 57; saída 1. Ambiente herdado com NODE_ENV=production. |
| Baseline complementar com NODE_ENV=test | **414 aprovados, nenhum teste reprovado**; três arquivos com falha de coleta por variáveis ausentes; 54 arquivos aprovados, de 57; saída 1. |
| Baseline npm run lint | **0 erros, 86 avisos**, saída 0. |
| npm run typecheck após implementação | **PASSOU**, saída 0. |
| npm run lint após implementação | **0 erros, 86 avisos**, saída 0; mesma quantidade do baseline. |
| npm run build após implementação | **PASSOU**, saída 0. Avisos de Browserslist antigo e chunk maior que 500 kB. |
| npm test final em ambiente de teste configurado | **441 testes aprovados em 59 arquivos**, nenhuma falha; saída 0. |
| Guard explícito no-provider-branding.test.ts | **1 teste aprovado em 1 arquivo**, saída 0. Guard/allowlist não alterados. |
| PostgreSQL 15 local, teste SQL de RLS | **PASS**, ROLLBACK concluído, saída 0. |
| git diff --check | **PASSOU**, saída 0. |

Comando exato da suíte final:

```bash
NODE_ENV=test VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=chave-ficticia-de-teste npm test
```

Valores fictícios locais, sem segredos, permitem importar módulos que validam configuração na inicialização. O modo de teste corrige as falhas de jsxDEV/módulos nativos observadas em produção; as variáveis eliminam as três falhas de coleta. Nenhum teste antigo foi removido/alterado. Os 441 incluem os sete novos.

Guard separado:

```bash
NODE_ENV=test npm test -- src/__tests__/no-provider-branding.test.ts
```

A primeira execução dos testes novos teve uma falha de scrollIntoView, API não implementada no JSDOM. O teste passou a simular essa API; a suíte final confirma ambos os testes de acesso aprovados. A tentativa inicial permanece registrada.

### Alcance do ensaio de banco

PostgreSQL 15 descartável, socket dentro do worktree, sem listener TCP ou conexão remota. `preparar-banco-local.py` monta dependências mínimas e extrai as implementações reais de has_role, notify, render_template e policies de notifications das migrations existentes. O teste inclui a migration nova integralmente, usa SET LOCAL ROLE authenticated/anon, identidades distintas e ROLLBACK. O banco temporário é desligado e removido ao concluir.

Comprovados: criação/leitura próprias; acesso por colega de equipe; bloqueio de leitura/resposta entre equipes, inclusive admin comum; acesso global owner/super_admin; status e resposta visíveis ao cliente; bloqueio de autoria forjada, reescrita, exclusão, campos protegidos e acesso anônimo; limites de conteúdo; filtro de equipes restrito; quatro notificações/entregas para dois tickets e dois administradores, com link e destinatário corretos.

É teste real de PostgreSQL/RLS, mas **não** é aplicação da cadeia inteira de migrations sobre cópia de produção.

## Artefatos e evidências nesta pasta

- `estudo.md`: reconhecimento e decisões, escrito antes da implementação.
- `implementacao.md`: este relatório.
- `preparar-banco-local.py`: preparação das dependências mínimas do ensaio.
- `baseline-tentativa.log`, `dependencias.log`, `baseline-testes.log`, `baseline-testes-ambiente-test.log`, `baseline-lint.log`: preparação e baselines.
- `typecheck.log`, `lint.log`, `build.log`, `testes-finais.log`, `guard-marca.log`: resultados finais.
- `testes-suporte-primeira-tentativa.log`: primeira execução, com a limitação do JSDOM corrigida depois.
- `banco-local.log`, `banco-dependencias.log`, `teste-rls.log`: banco descartável e ensaio transacional.

## Pendências e publicação

1. **NÃO EXECUTADO:** migration remota, ensaio da cadeia completa em homologação e deploy. Etapas do orquestrador após auditoria; aplicar migration antes do frontend.
2. **NÃO EXECUTADO:** smoke test em navegador com sessões reais de duas equipes e owner/super_admin, incluindo evento no sino. A interface foi validada por testes de componentes; registro/isolamento dos avisos, por PostgreSQL local.
3. Administrador sem perfil/equipe pode consultar tickets globais pelo papel, mas o centro existente depende de equipe. Para receber avisos, precisa de perfil/equipe associados. Políticas/preferências existentes podem silenciar o aviso; tickets continuam disponíveis no Admin.
4. Se houver problema após publicação, reverter o frontend e preservar tabelas/dados para diagnóstico. A migration é aditiva; não foi entregue rollback destrutivo.
