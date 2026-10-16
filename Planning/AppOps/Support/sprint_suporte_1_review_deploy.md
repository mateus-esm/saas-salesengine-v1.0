# Sprint Suporte 1 — revisão e deploy (16/10/2026)

Claude concluiu as 10 tarefas no worktree `../se-sup1`, até `ab4e222`.
A sessão `07c3a33c-57f2-43f3-9eba-43d830bf7f14` encerrou por limite durante
a revisão final. Esta revisão continua esse trabalho na branch
`codex/SE-SUP1-reviewed-release`, com `origin/main` integrado (`b6a3c90`).
O pedido explícito de Mateus em 16/10 autoriza revisão, correções e deploy;
a proibição de produção do plano de implementação descreve a fase anterior.

## Correções da revisão

- `analyze-message` agora exige a service role antes de ler o body. Os dois
  webhooks chamadores já a enviam; requisição pública/JWT de usuário é recusada.

- `owner` é dono de equipe: só `super_admin` lê o cache administrativo de
  modelos e recebe os alertas de modelos sem preço.
- Desfechos de reunião travam também a oportunidade antes de conferir/gravar
  o evento: card e eventos diferentes da agenda não podem gravar em paralelo.
- Há 25 grupos de conversas ativas duplicadas na produção. A migration inicial
  pula o índice único nesse caso. A guarda com advisory lock impede NOVAS
  duplicatas e reaberturas em conflito sem mesclar/apagar o histórico.
- Permissões explícitas das tabelas novas; funções internas de gatilho sem
  EXECUTE direto para anon/authenticated.
- Deep link `/chat?contact=...` passa a abrir a conversa também no mobile,
  ocultando o inbox que a nova regra de layout deixava sobre a conversa.
- O catálogo local/cache vencido continua marcado como desatualizado durante
  o intervalo de throttle após falha do provedor.
- Testes SQL executáveis: casts UUID em fixtures da roleta, asserção de
  vendedor histórico e marcador PASS exigido pelo runner oficial.

## Validação

- Sete suítes SQL (migrations reais + fixtures + isolamento + permissões) passaram
  em BEGIN/ROLLBACK contra o projeto linkado. Nenhuma fixture foi persistida.
- 89 testes Deno alterados passaram (incluindo autenticação interna).
- Typecheck e build de produção passaram.
- Suíte frontend completa: um teste de Outreach excedeu o prazo sob carga;
  os sete testes de Outreach passam isolados no release e no checkout original.
  Configuração pública fictícia foi usada nos testes/build locais, nunca secrets.
- Backups locais das dez funções Edge e definições SQL anteriores em
  `../saas-salesengine-v1.0/tmp/sup1-release-backup` (não versionar).

## Limites e pendências reais

- GPT Maker `GET /v2/models` retorna HTTP 404 na sonda autenticada. Cache,
  fallback, botão e preço provisório existem; atualização automática NÃO está
  validada até confirmar a rota real e configurar `GPT_MAKER_MODELS_PATH`.
- HUMAN_AGENT continua desligado. A correção de janela de 24h está pronta;
  envio humano até 7 dias depende de suporte verificado do provedor.
- O mapa de marcos da Solo/replay histórico depende de confirmação do gestor.
  Não aplicar o script de dados silenciosamente; preserva won/lost e manuais.
- Conversas históricas duplicadas foram preservadas; limpeza é separada.
- Google Agenda permanece fora desta sprint, conforme decisão registrada.
- Não foram recebidos prints do cliente para confirmar os defeitos mobile;
  a revisão cobre o código e layout responsivo, sem afirmar QA visual autenticado.
- O Security Advisor já contém avisos anteriores ao release, inclusive proteção
  de senha vazada desativada e funções SECURITY DEFINER existentes. A revisão
  valida o escopo deste sprint; não certifica a ausência de falhas em todo o app.

## Deploy

Aplicar somente migrations `sesup1`, em ordem, com transação e registro do
versionamento; nunca `db push --include-all`. A migration STAGEHOOK já existe
na produção; seu arquivo foi recuperado para o Git. Depois publicar as dez
funções afetadas e o frontend pelo fluxo Git existente, preservando verify_jwt.
Não enviar mensagens de suporte nem fechar tickets sem validação do cliente.

A revisão também identificou que `gpt-maker-webhook` recebe eventos públicos sem
assinatura/segredo de origem. Isso é anterior à sprint; endurecer esse canal exige
coordenar o segredo com a configuração de entrega do provedor para não parar a ingestão.
