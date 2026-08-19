- The models available need to be sync with the gpt maker, we need to have the
  same models available in both places.

- Knowledge Base need to be sync with the gpt maker, we need to have the same
  knowledge base in both places, in this moment this is not working, the 'perfil
  do agente' and 'contexto da empresa' isnt sync.

- Canais: still not working, the 'canais' in studio_ai need to be sync with the
  'canais' in gpt maker, so need to fetch the real channels.

- Config:

This is the config available in GPT Maker:

'Transferir para humano Habilite para que o agente possa transferir o
atendimento para aba 'em espera' de equipe humana.

Resumo ao transferir para humano Habilite para gerar automaticamente um resumo
do atendimento ao transferir a conversa da IA para um atendente humano.

Horário de atendimento Configure os dias e horários que o agente pode realizar
atendimentos.

Moderação de conteúdo Identificar conteúdo prejudicial em textos e imagens.

Usar Emojis Nas Respostas Define se o agente pode utilizar emojis em suas
respostas.

Assinar nome do agente nas respostas Ative esta opção para que o agente de IA
adicione automaticamente sua assinatura em cada resposta enviada ao usuário.

Restringir Temas Permitidos Marque essa opção para que o agente não fale sobre
outros assuntos.

Dividir resposta em partes Em caso da mensagem ficar grande, o agente pode
separar em várias mensagens.

Permitir registrar lembretes Habilite essa opção para que o agente tenha a
capacidade de registrar lembretes ao usuário.

Busca inteligênte do treinamento Beta O agente consulta a base de treinamentos
no momento certo, para trazer respostas mais precisas

Timezone do agente Escolha o timezone que agente usará para datas, por exemplo
agendar reuniões. (GMT-03:00) Fortaleza Tempo de resposta Defina um intervalo
para o agente esperar e dar uma resposta. 10 segundos Limite de interações por
atendimento Defina a quantidade de interações que o agente pode aceitar por
atendimento. 20 interações Ação ao atingir limite de interações Define o que
acontece ao atingir o limite de interações por atendimento Bloquear por 5m

Preferências da conversa Conversa Ações de inatividade Webhooks Regras de
transferência Configure ações que o agente deve executar quando o cliente parar
de responder.

Adicionar ação anterior Se não responder em

10 minutos o agente deve Finalizar atendimento.

Escute eventos que acontecem no sistema e tome ações como enviar um webhook.

Tipo do evento: Novo agendamento Ação: Enviar Webhook URL:
https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/gpt-maker-webhook

Tipo do evento: Nova mensagem Ação: Enviar Webhook URL:
https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/gpt-maker-webhook

Tipo do evento: Primeiro atendimento Ação: Enviar Webhook URL:
https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/gpt-maker-webhook

Configure instruções para o agente fazer transferência do atendimento.

Transferir para:

um humano

Mateus Sombra Devolver ao finalizar Não informar quando transferir Instruções:
46/255 Quando o cliente estiver se mostrando irritado

Adicionar regra de transferência.

' Understand this options and the routes to be paired.

Wave 2:

- Make an full review if the Studio AI achived the desired outcomes
- In our business rules we sell the cr for the double of the gptmaker so the
  price of each model is 2x the price in the gpt maker: ex - gpt 5.6 sol
  (gptmaker - 14cr in salesengine - 28cr)
- the consumer of credits in the period and total available the software is
  fetching all the consume of the workspace, but need to fetch only of this
  specifc agent or client in the gptmaker, and the credits available is based in
  the account plan.
- Also adjust in the knowledge base -> treinamento personalizado -> the blocks i
  want that i can put an personlized name in the block and we sent it with the
  block to the gpt maker: ex- bl01 and the name be an personlized field.
