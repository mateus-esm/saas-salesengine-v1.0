# Solo Dev V1 — PoC (branch `chore/solo-dev-v1-poc`)

Esta branch é uma **prova de conceito controlada** do fluxo Solo Dev V1. O objetivo
não é entregar produto, e sim validar o ciclo automatizado ponta a ponta com uma
mudança pequena e reversível.

## Fluxo validado

1. **Worktree** — a tarefa é isolada em um git worktree dedicado, sem tocar o
   checkout principal nem outras tarefas em andamento.
2. **Coding agent** — o agente executa a alteração dentro do worktree, com escopo
   restrito ao que foi pedido.
3. **Checks** — validações automáticas (lint, tipos, testes/build conforme o
   escopo) rodam antes de qualquer commit.
4. **Commit** — commit na branch da tarefa, com mensagem descritiva; nada é
   commitado em `main`.
5. **PR** — abertura de Pull Request para revisão humana, que segue sendo o
   ponto de decisão final.
6. **Retorno no Telegram** — notificação do resultado (sucesso, falha de check
   ou link do PR) no canal de acompanhamento.

## Escopo e limites

- Mudança mínima e auditável: apenas este documento é criado.
- Nenhum outro arquivo do repositório é modificado.
- Sem alteração de configuração, dependências, infraestrutura ou deploy.
- O merge não é automático: depende de aprovação no PR.

## Critério de sucesso

O PoC é considerado bem-sucedido quando as seis etapas acima ocorrem em sequência,
sem intervenção manual entre elas, e o retorno chega no Telegram com o link do PR.
