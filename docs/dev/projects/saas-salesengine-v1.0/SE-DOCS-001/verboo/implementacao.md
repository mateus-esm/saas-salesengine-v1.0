# SE-DOCS-001 — Implementação (Central de Ajuda v1)

## O que foi feito

Hub de Tutoriais & Help Center nativo em `/docs`, com 14 guias v1 cobrindo **todos os módulos primários do menu real** (inventário exaustivo derivado do código — ver `estudo.md`):

- **Comece por aqui**: Primeiros passos, Início e Copiloto
- **Dashboard**: lendo seus números (5 abas + relatórios agendados)
- **Chat**: atendimento com o agente de IA (inbox, assumir/devolver, janela de 24h)
- **CRM**: pipeline/contatos/operação (9 abas) + Configurando pipelines e etapas
- **AI Studio**: configurando o cérebro do agente (5 abas)
- **Integrações**: Webhooks + Outreach
- **Billing**: plano, créditos e faturas (2 pools)
- **Conta**: Notificações, Suporte, Toolkit/Clube (Em Breve), FAQ

Cada guia tem a mesma estrutura útil de verdade: **o que é → para que serve → passo a passo → erros comuns**, com nomes reais de botões/abas extraídos do código.

**Integração UI/UX**: rota `/docs` (índice com busca local + agrupamento por módulo + página de artigo com anterior/próximo), item **"Central de Ajuda"** no menu lateral (`AppSidebar`), no `TopNavbar` e no cartão do `/home`. `/tutorial` **redireciona** para `/docs` (`<Navigate replace>`) — nenhum link quebrado; o arquivo `Tutorial.tsx` foi mantido intacto. Sem `PageRouteGuard` na nova rota de propósito: ajuda visível para todos, como o `/tutorial` sempre foi. Nenhum `requiredRole`/`permissionKey` existente foi alterado.

**Extensibilidade (atualizável sem deploy)**: migration aditiva cria `help_articles` + `help_article_revisions` com RLS (leitura para `authenticated`, escrita só `service_role`) e trigger que fotografa cada versão publicada. O front lê o banco em runtime (React Query, cache 5 min) e usa o seed do bundle como fallback offline (selo "conteúdo offline").

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `src/data/help-articles.seed.ts` | **NOVO** — 14 artigos canônicos v1 (espelho do seed SQL) |
| `src/hooks/useHelpArticles.ts` | **NOVO** — leitura runtime Supabase + fallback seed |
| `src/pages/docs/DocsLayout.tsx` | **NOVO** — shell `/docs`: índice lateral + busca + rodapé Suporte |
| `src/pages/docs/DocsIndex.tsx` | **NOVO** — índice com destaques por módulo (+ índice mobile) |
| `src/pages/docs/DocsArticle.tsx` | **NOVO** — artigo com render Markdown próprio (sem lib nova) + anterior/próximo |
| `src/pages/__tests__/Docs.test.tsx` | **NOVO** — 4 testes (índice, artigo, 404, redirect `/tutorial`) |
| `supabase/migrations/20260926000300_sedocs001_help_center.sql` | **NOVO** — tabelas + RLS + triggers + seed v1 |
| `src/App.tsx` | rota `/docs` aninhada + redirect `/tutorial` → `/docs` |
| `src/components/AppSidebar.tsx` | "Tutorial" → "Central de Ajuda" (`/docs`), mesmo ícone, sem role |
| `src/components/TopNavbar.tsx` | idem |
| `src/pages/Home.tsx` | cartão "Tutorial" → "Central de Ajuda" (`/docs`) |
| `docs/.../verboo/estudo.md` | estudo (inventário, mapeamento contrato×real, decisão de arquitetura) |

**Não tocados** (conforme restrições): motor de outreach, `send-chat-message`, `start-conversation`, `crm-webhook`, roles/permissions existentes, segredos.

## Decisões

1. **Tabela Supabase em vez de Markdown remoto ou `custom_tables`** — RLS já é o padrão do repo, versionamento trivial via tabela de revisões, zero nova infra (detalhe e trade-offs no `estudo.md` §3).
2. **Render Markdown próprio (~60 linhas)** em vez de nova dependência — o corpo é conteúdo interno versionado, e o subconjunto usado (títulos, listas, negrito, código inline, links) é coberto.
3. **Escrita só `service_role`, sem editor no app na v1** — evita superfície de admin; edição via Studio/SQL pelo time interno.
4. **Fallback estático no bundle** — a ajuda nunca quebra por falha de rede.
5. **Redirect, não remoção, do `/tutorial`** — bookmarks e links antigos continuam funcionando.

## Prova: como um artigo muda sem rebuild (para o orquestrador/auditoria)

```sql
-- 1. Publicar correção (efeito no app em até ~5 min, sem build/deploy):
update public.help_articles
  set body_md = replace(body_md, 'texto antigo', 'texto novo')
  where slug = 'chat';

-- 2. Auditar o versionamento automático:
select version, left(title, 40), published_at
  from public.help_article_revisions
  where article_id = (select id from public.help_articles where slug = 'chat')
  order by version desc;
-- Cada UPDATE publicado gera uma linha nova em help_article_revisions via trigger.

-- 3. Rollback sem deploy (voltar à versão N):
update public.help_articles a set (title, body_md) =
  (select title, body_md from public.help_article_revisions
    where article_id = a.id and version = N)
  where slug = 'chat';
```

E manter o espelho: aplicar o mesmo texto em `src/data/help-articles.seed.ts` para o próximo build levar o fallback atualizado.

## Validações executadas (resultado real)

| Validação | Resultado |
|---|---|
| Baseline `npm test` antes da mudança | **NÃO EXECUTADO** — `npm`/`node` exigem aprovação no sandbox e não rodaram |
| `npm run typecheck` / `lint` / `build` / `npm test` depois | **NÃO EXECUTADO** — mesmo motivo; nenhum resultado inventado |
| Guard de marca do provider nos 6 arquivos novos (`gpt-?maker\|openai\|anthropic\|claude\|deepseek\|gemini`, case-insensitive) | **PASSOU** — zero ocorrências (diz-se "provedor de IA" / "endpoint do provedor") |
| Verificação independente (agente `verification`) | **PASS** em rotas, menu, migration aditiva, paridade dos 14 slugs TS×SQL, PT-BR, ausência de marca; **FAIL inicial só no teste** (queries ambíguas) → corrigido → **re-verificação PASS** |
| Revisão estática manual | Imports/rotas conferidos: `Tutorial` sem referências restantes; primitivas `ui/input`, `ui/skeleton`, `ui/badge` existem; mock do teste cobre a cadeia `.from().select().eq().order()` do hook |
| Escopo do diff | `git diff --stat origin/main`: só os 4 arquivos editados acima + arquivos novos da task |

## Pendências (para o orquestrador / próximos passos)

1. **Rodar de verdade**: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (inclui `no-provider-branding.test.ts` varrendo os arquivos novos e `Docs.test.tsx`) — bloqueados neste sandbox.
2. **Aplicar a migration** no Supabase de produção (`20260926000300_sedocs001_help_center.sql`, aditiva, sem destrutivo) — o seed popula os 14 artigos e o trigger gera as revisões v1.
3. **Smoke test pós-deploy**: abrir `/docs`, buscar "crédito", abrir `/docs/chat`, abrir `/tutorial` (deve cair em `/docs`), conferir selo de conteúdo (banco acessível = sem selo "conteúdo offline").
4. **Futuro (fora da v1)**: editor admin no app, revisões visíveis na UI, artigos por idioma/tenant, analytics de "foi útil?".
