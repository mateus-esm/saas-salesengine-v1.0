# Casa Flow Ads — recuperação com fluxo do Felipe

Status: publicado após aprovação explícita do usuário (“deploy”). GPT Maker: 21 operações concluídas e confirmadas por leitura. Rev: abertura atualizada e 19 conteúdos do cache atualizados em transação; conferência por hash confirma 19/19 e abertura idêntica ao plano. Total de treinamentos continua 20, sem duplicação.

Testes conversacionais pós-deploy: dois cenários sintéticos (preço e descoberta) retornaram erro interno do GPT Maker `Transaction silently rolled back because it has been marked as rollback-only`, em três tentativas por cenário. Sem resposta do modelo, não há validação funcional do atendimento. Nenhuma mensagem enviada a contatos reais. Ver `tmp/casa-flow-recovery/smoke-report.json`. Modelo e intenção preservados; não foi presumida a causa do erro.

## Alterações para revisão

- Persona Vitória; Working e comportamento preenchidos.
- Fluxo progressivo: necessidade/dor → conexão/valor → link → qualificação → convite → investimento → encaminhamento de agenda.
- Uma pergunta por vez, aproveitando histórico e abertura do Rev.
- Projeto de 3 meses por R$ 1.500, em 3x de R$ 500 sem juros, mais cerca de R$ 200/mês de anúncios. Remove exigência antiga de R$ 500/mês de mídia.
- Números do Felipe incorporados como relatos do time, com variação de resultados; nunca garantia individual.
- Não alegar análise de link sem acesso real. Perfil desconhecido vai para análise antes do convite.
- Intenção de reunião encaminha à equipe; não equivale a agenda confirmada.
- Transferência humana para cliente ativo; proposta desabilita retomada automática (`resumeTransferHumanAI=false`).
- Atualização dos 19 blocos por ID existente, com marcadores SV_BLOCK. Preserva treinamento vazio, modelo, canais e intenção.

## Evidências e validação

Backup atual obtido em 30/09/2026: 20 treinamentos e uma intenção. Comportamento novo e treinamentos antigos apresentam oferta divergente e referências a ferramentas não demonstradas na configuração. Não há evidência de autoria das alterações.

10 interações / 103 mensagens consultadas. Análise por interação: quatro alertas de fillers e um de emoji/símbolo. Cinco alertas adicionais de repetição do relatório agregado comparam conversas distintas e não devem ser tratados como falhas de repetição no mesmo atendimento.

Dataset válido: Working 357 caracteres; comportamento 2724; maior bloco 671. Testes do Agent Creator: 27/27. Dry-run por IDs: 21 operações (agente, configurações, 19 treinamentos), sem criação de duplicatas. Não foram executados testes conversacionais do comportamento proposto em produção.

## Rev e publicação

Usuário confirmou: Rev é o software e Casa Flow Ads é o time. O conector Supabase verificou o vínculo atual: equipe aa33b576-3959-4a81-8e73-4027039ea2ce, mesmo workspace/agente do GPT Maker. Porta Meta ADS - Cadastro ativa e selecionada na abertura, canal 3F32F1093C8681A460108E59734FC41E. Abertura usa Vitória e pergunta sobre rentabilidade, conforme fluxo novo. Variável correta `{{lead.first_name}}`, suportada no código. Canal, porta, horários, timezone e opt-out preservados. Cache atualizado mantendo os 20 IDs existentes.

Executor: `tmp/casa-flow-recovery/apply-recovery.mjs`. Dry-run por padrão; live exige `--approved`, verifica alterações desde o backup, salva backup pré-deploy e confere campos após escrita. Em falha registra operações concluídas. Não altera Rev.

Antes do deploy: revisão deste plano conforme AGENTS.md do Agent Creator. `rev-apply-reviewed.sql` está preparado para atualizar somente a abertura e o conteúdo dos 19 itens do cache; transação verifica vínculo e ausência de mudanças desde o backup. Aplicar depois de confirmar o deploy do GPT Maker por leitura. Não exige deploy de código ou migration. Após aplicação: leitura de verificação e simulações isoladas de lead qualificado, lacunas, imóvel incompatível, objeção, link inacessível, cliente ativo e agenda indisponível. Webhooks reais devem ser isolados nos testes. O endpoint de intenção ainda aponta para notificação da equipe; a integração de calendário não foi demonstrada.

Arquivos: `dataset-review.json` e `update-plan-review.json`. Backups e mensagens ficam em `tmp/casa-flow-recovery`; contêm dados privados e não devem ser publicados. O review.md antigo nessa pasta documenta a primeira proposta e foi substituído por este relatório.
