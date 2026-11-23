Rastreio de campanhas e criativos — Solo × Rev 23 de nov. de 2026 · @Mateus Para
saber qual criativo vende, o Rev precisa ligar cada lead ao anúncio, ao criativo
e à campanha, receber o gasto por anúncio sozinho e devolver ao Meta e ao Google
quais leads viraram MQL, SQL e venda. Hoje ele guarda parte disso, mas sem ligar
as pontas. Fundamentos: como um anúncio é montado Meta e Google organizam tudo
em três níveis, e cada nível tem um ID numérico que nunca muda, mesmo quando
alguém troca o nome. • Campanha: o objetivo (mensagens, cadastro, site) e, se
for CBO, o orçamento. CBO = a plataforma distribui a verba entre os conjuntos;
ABO = cada conjunto tem a sua. • Conjunto (Google: grupo de anúncios): para quem
aparece, onde aparece, quanto gasta e qual evento a plataforma tenta maximizar.
• Anúncio: o que a pessoa vê (o criativo, o texto, o botão) e para onde vai
(WhatsApp, formulário, site). • Criativo: o vídeo ou a imagem. A plataforma não
tem um ID estável para "o vídeo do Carmona" que valha entre anúncios. Por isso o
código do estúdio (P002-V3) no nome do anúncio é o que permite somar tudo o que
esse vídeo gerou. Três formas de um lead carregar sua origem: • UTMs, quando o
anúncio leva a um link (site, landing). • Click IDs: fbclid e gclid no link,
ctwa_clid no clique para WhatsApp. • ID do lead (leadgen_id), no formulário
instantâneo do Meta. O que os leads de hoje mostram Os três leads chegaram de
anúncio pago do Meta, mas nenhum está ligado a uma campanha cadastrada nem a um
criativo do estúdio. Lead Como chegou O que o Rev guardou O que falta 23/11
07:01 Formulário instantâneo do Meta Nomes da campanha, do conjunto e do anúncio
(AGO02) e o nome do formulário Categoria errada ("Importação / API" em vez de
Social Pago · Meta). Sem ID do lead no Meta, do anúncio e da campanha. AGO02 não
diz qual vídeo é 22/11 21:01 Mesmo formulário, mesmo anúncio Igual ao anterior
Igual. E a campanha se chama "NOVO TESTE JANEIRO" rodando em novembro: o nome já
não diz o que ela é 22/11 19:21 Clique para WhatsApp, atendido pelo agente de IA
Social Pago · Meta, UTM facebook / paid_social, o título do anúncio ("Converse
conosco"), o link curto e o ctwa_clid A campanha e o criativo. O título
"Converse conosco" é o mesmo em vários anúncios. O ID do anúncio pode ter vindo,
mas não aparece na tela Duas coisas boas já existem. O Rev lê os nomes de
campanha, conjunto e anúncio do formulário. E guarda o ctwa_clid, que é
exatamente a chave que o Meta pede para receber de volta a qualificação de um
lead de WhatsApp. O problema é de ligação. O Rev só casa a campanha pelo ID,
pelo utm_campaign ou pelo nome cadastrado como chave. O formulário entra pela
porta de importação, sem IDs. O WhatsApp entra com o ID do anúncio, que hoje não
é chave de nada. Métricas: do gasto à venda O gerenciador diz se o anúncio chama
atenção e gera contato. Só o Rev diz se esse contato vira venda. Um criativo bom
é julgado pelo custo por venda, não pelo custo por lead. Etapa Métrica Conta
Onde ver Entrega CPM gasto ÷ mil impressões Gerenciador Entrega Frequência
impressões ÷ alcance (acima de ~3, o público cansa) Gerenciador Atenção Taxa de
gancho visualizações de 3s ÷ impressões Gerenciador Atenção Retenção ThruPlays
(15s) ÷ visualizações de 3s Gerenciador Clique CTR cliques ÷ impressões
Gerenciador Contato Custo por lead ou conversa gasto ÷ leads ou conversas que a
plataforma contou Gerenciador Qualificação Custo por MQL / SQL gasto ÷ leads que
viraram MQL / SQL Rev Venda Custo por ganho (CAC de mídia) gasto ÷ negócios
ganhos Rev Venda ROAS receita fechada ÷ gasto Rev A plataforma conta como "lead"
qualquer formulário enviado e como "conversa" qualquer mensagem iniciada. Por
isso os números do gerenciador e do Rev nunca batem, e tudo bem: eles medem
coisas diferentes. Para comparar criativos, o mesmo código (P002-V3) precisa
aparecer nos dois lados. Assim o gasto do gerenciador e a venda do Rev somam no
mesmo criativo. O que pedir ao Rev São quatro entregas, nesta ordem. A primeira
resolve a ligação e já faz o resto valer a pena.

1. Cadastro de criativos e anúncios (o formulário da performance). ◦ Duas
   tabelas novas: criativo (código P002-V3, peça, formato, versão, data de
   entrega, link dos arquivos) e anúncio (plataforma, ID do anúncio, ID e nome
   do conjunto, campanha, criativo, destino, formulário). ◦ O toque passa a
   resolver nesta ordem: ID do anúncio → anúncio cadastrado → campanha e
   criativo. Depois, o código no começo do utm_content ou do nome do anúncio
   (padrão P000-V0). Depois, o que já existe (ID da campanha, utm_campaign,
   nome). ◦ Isso fecha o buraco do WhatsApp, que chega só com o ID do anúncio.
2. Entrada direta dos formulários do Meta. ◦ Trocar a entrada atual ("Importação
   / API") pelo webhook de Lead Ads do próprio Meta. ◦ Guardar o ID do lead no
   Meta (leadgen_id), os IDs do anúncio, do conjunto, da campanha e do
   formulário. ◦ Categoria automática Social Pago · Meta. ◦ O leadgen_id é o que
   permite devolver a qualificação depois (item 4).
3. Gasto e métricas por anúncio, automáticos. ◦ Uma linha por dia por anúncio:
   gasto, impressões, alcance, cliques, visualizações de 3s, ThruPlays, leads e
   conversas da plataforma. ◦ O total por campanha alimenta o investimento que o
   Rev já usa no relatório de campanhas (custo por lead, custo por ganho, ROAS).
   A tabela de investimento já prevê origem meta_api e google_api. ◦ Fonte:
   Windsor.ai ou as APIs oficiais (ver Decisões).
4. Devolver a qualificação para o Meta e o Google. ◦ Quando o lead muda de etapa
   no Rev (MQL, SQL, oportunidade, ganho), o Rev envia um evento para a
   plataforma. Assim o algoritmo aprende a buscar lead que compra, não lead
   barato. ◦ Meta, pela API de Conversões (CAPI). A chave depende de onde o lead
   entrou: formulário, pelo leadgen_id; WhatsApp, pelo ctwa_clid; site, pelo
   fbclid mais e-mail e telefone criptografados (SHA-256). ◦ Google, por
   importação de conversões offline usando o gclid, que o Rev já guarda. ◦ Uma
   tabela de mapeamento etapa do funil → nome do evento, e um ID único por
   evento para não contar duas vezes. ◦ LGPD: só dado criptografado sai do Rev,
   e o envio fica registrado por lead. O Windsor serve para ler dados das
   plataformas (item 3). A devolução (item 4) sai do próprio Rev, direto para o
   Meta e o Google. Fluxo dos dados O código nasce no estúdio e chega ao Rev
   pelo nome do anúncio e pelas UTMs. O gasto chega pelo Windsor (ou API). A
   qualificação volta para a plataforma, que passa a buscar mais gente parecida
   com quem comprou. Padrão de nomes e o formulário da performance O código do
   criativo no começo do nome do anúncio é a única regra que não pode falhar. O
   resto organiza a leitura. Nível Padrão Exemplo Campanha AAAA-MM | OBJETIVO |
   TEMA | PRAÇA 2026-11 | MSG | Engenharia ponta a ponta | Fortaleza Conjunto
   PÚBLICO | POSICIONAMENTO Proprietários 30-55 | Reels Anúncio CÓDIGO | PEÇA |
   FORMATO P002-V3 | Carmona ponta a ponta | reels 52s Objetivos curtos: MSG
   (mensagens), CAD (cadastro/formulário), SITE (tráfego ou conversão no site),
   ALC (alcance). Parâmetros de URL (anúncio que leva ao site ou formulário
   externo): • Meta:
   utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_id={{campaign.id}}&utm_content=p002-v3_{{ad.id}}&utm_term={{adset.id}}
   • Google:
   utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content=p002-v3_{creative}&utm_term={keyword}
   O formulário que a performance preenche no Rev a cada anúncio novo: Campo
   Exemplo Por quê Código do criativo P002-V3 Liga ao vídeo entregue pelo
   estúdio Plataforma Meta

Campanha (nome e ID) 2026-11 | MSG | … · 120210… O ID é a chave que não muda
quando renomeiam Conjunto (nome e ID) Proprietários 30-55 | Reels Compara
públicos com o mesmo criativo ID do anúncio 120211… É o que chega no lead de
WhatsApp Destino WhatsApp / formulário / site Define a chave de devolução
Formulário (se houver) FORMULÁRIO SOLON

Início, fim e verba 23/11 · — · R$/dia

Mensagem pré-preenchida (WhatsApp) "Oi! Vi o projeto de engenharia da Solo" O
SDR sabe de onde veio O estúdio entrega o código pronto na ficha rastreio.txt de
cada peça. A performance devolve os IDs. Decisões antes de começar [ ] O que é
MQL, SQL e venda na Solo. Uma regra por etapa, ligada às etapas do funil no Rev.
Exemplo: MQL = conta de luz acima de R$ X e imóvel próprio; SQL = visita técnica
agendada; venda = contrato assinado. Sem isso, a devolução ensina o algoritmo
errado. [ ] Windsor.ai ou API direta. Windsor: liga Meta e Google em dias, cobra
assinatura mensal, fica um fornecedor no meio. API direta (Marketing API do Meta
e Google Ads API): sem assinatura, mais semanas de engenharia, e a do Google
exige pedir um token de desenvolvedor aprovado. Sugestão: começar com Windsor e
trocar se o volume justificar. [ ] WhatsApp oficial. Hoje o número roda pela
Solo API (não oficial). Os dados do anúncio chegam, mas não em toda conversa. A
devolução de eventos de WhatsApp pela CAPI provavelmente pede o número ligado a
uma conta oficial do WhatsApp Business. A engenharia deve confirmar na
documentação do Meta antes de prometer. [ ] Quem preenche o formulário de
anúncio e quando. Sugestão: a performance, no mesmo dia em que o anúncio sobe.
Sem o ID do anúncio cadastrado, o lead cai em "Sem campanha". [ ] Renomear as
campanhas ativas. Exemplo: "NOVO TESTE JANEIRO" rodando em novembro. Avaliar com
a performance se renomeia agora (nome não reinicia o aprendizado; trocar
parâmetros de URL pode mandar o anúncio para revisão). Mensagem para a
engenharia do Rev Pessoal, quero conseguir medir no Rev quanto cada criativo e
cada campanha de anúncio vende, não só quantos leads traz. Hoje o Rev já guarda
as UTMs, o ctwa_clid e os nomes do anúncio, mas não liga isso a uma campanha nem
a um criativo. Os leads do formulário do Meta entram como "Importação / API" e
os de WhatsApp ficam sem campanha. Preciso de quatro coisas, nesta ordem:

1. Cadastro de criativos e anúncios. Criativo com código (ex.: P002-V3), anúncio
   com o ID da plataforma. O toque resolve ID do anúncio → anúncio → campanha +
   criativo, e também lê o código no início do utm_content e do nome do anúncio.
   A equipe de performance preenche um formulário no Rev a cada anúncio novo.
2. Entrada direta dos formulários do Meta pelo webhook de Lead Ads, guardando
   leadgen_id e os IDs de anúncio, conjunto, campanha e formulário, com
   categoria Social Pago · Meta.
3. Gasto e métricas diárias por anúncio, automáticos, alimentando o investimento
   das campanhas. Proposta: começar com Windsor.ai, avaliar API direta depois.
4. Devolução da qualificação: quando o lead vira MQL, SQL ou venda, enviar o
   evento para a CAPI do Meta (leadgen_id, ctwa_clid ou fbclid + dados
   criptografados) e para as conversões offline do Google (gclid). Com
   mapeamento etapa → evento e ID único por evento. Antes do item 4 eu defino as
   regras de MQL e SQL. Para o WhatsApp, confirmem se a CAPI funciona com o
   nosso número atual ou se precisa da conta oficial. Detalhes, exemplos reais
   de leads e o padrão de nomes estão neste doc. Me digam o esforço de cada item
   e o que precisam de mim.

- Também ser possível a equipe registrar a mensagem padrão que chega em caso de
  ser mensagem wpp para conseguirmos trackear.

- Estou pensando em evoluir campanhas para Growth! Uma área completa pensada e
  alinha com a idéia de Growth Hacking e alinhar as fontes de captação com as
  fontes do Growth e ai sim termos a área de Ads que seja essa vinculação mas
  também outras formas de captaçao, programas de indicação, eventos, etc que
  poderiamos planejar e fazer testes.

Análise a melhor forma!

---

# Conclusão da Sprint 16 — Growth (23/11/2026)

Status: **concluída e em produção** (PRs #73, #74 e o do filtro de período). Design em
`docs/superpowers/specs/2026-11-23-sprint16-growth-design.md`.

## O que foi entregue

**Growth (substitui Campanhas no CRM)**, com um **filtro de período único** no topo
(presets, "Todo o período" e intervalo personalizado) que vale para todas as abas:

- **Experimentos** — planilha editável: status, hipótese, canal, campanha, criativo,
  ICE (impacto × confiança × facilidade), métrica, base, meta, resultado ao vivo do Rev
  (verde/vermelho contra a meta), datas, decisão e aprendizado.
- **Canais & campanhas** — leads, ganhos, investimento e ROAS **no período**; filtro por
  canal; "Quem mais indica" no canal Indicação; card **Leads sem campanha** para ligar
  grupos de origem a uma campanha (ou criar uma).
- **Ads** — Desempenho por criativo e por anúncio (CPM, frequência, gancho, retenção, CTR,
  custo por contato × leads, CPL, negócios, ganhos, custo por ganho, ROAS), com miniatura;
  Anúncios ("a completar", formulário da performance, quadro "Do gerenciador");
  Criativos.
- **Resultados** — por campanha ou **por canal** (gasto do canal × leads/ganhos/receita do
  canal: é o retorno que fecha quando o lead não tem anúncio).
- **Entradas** — inalterado; o carimbo de fonte também está no modal do webhook de
  entrada de leads.

**Ligação do lead ao anúncio**: ID do anúncio (inclusive o prefixado `ag:` dos
formulários) → mensagem padrão do WhatsApp → nome do anúncio → código no `utm_content`
→ regras antigas. Anúncio casado = mídia paga (o formulário do Meta saiu de
"Importação / API").

**Integrações** (`/integracoes`, galeria): **Windsor.ai** com a chave de cada equipe no
Vault; sincronização diária 06:10 + manual (até 365 dias). Traz métricas por anúncio/dia
e o anúncio em si (objetivo, destino, vídeo, miniatura, texto, botão, status, verba,
prévia). Cria sozinho a campanha do Rev que falta, um criativo por vídeo, o destino e o
status. Gasto por anúncio → investimento da campanha (meta_api/google_api).

**Fontes**: novas *Rede pessoal* e *Base de clientes*, dica de uso por fonte, *Indicado
por* + programa de indicação.

## Números da Solo Energia depois da sprint

- 44 anúncios, 21 criativos, 4 campanhas do Meta criadas pela sincronização; 3 anúncios
  "a completar" (AD01–03, sem destino).
- Leads com ID de anúncio ligados: **112 de 114** (os 2 restantes chegaram com uma
  mensagem de erro do Meta no lugar do ID).
- Leads sem campanha: **1.500 → 7**. O histórico importado foi ligado por rótulo de origem
  a campanhas/iniciativas do canal certo (Meta histórico, Programa de Indicação, Base
  Ativa, Prospecção Ativa, Landing Page, Google histórico, Base importada, Agente de IA…).
  Script e como desfazer: `supabase/scripts/2026-11-23_sprint16_solo_link_legacy_sources.sql`.
- Gasto Meta puxado (180 dias): R$ 8.275,66.

## Pontos de atenção

- O gasto do Windsor começa em ~maio/2026 (180 dias puxados); os leads vão até 2024.
  Para ROI, use períodos dentro da janela do gasto (ou puxe 365 dias em Integrações).
- O histórico pago sem anúncio cai em "Meta Ads · histórico (sem anúncio)": o CPL por
  campanha do Meta subestima leads; o retorno certo desse período é **Por canal**.
- Google Ads não conectado no Windsor da Solo (selecionar a conta em onboard.windsor.ai).
- Deploy de migrations: não usar `supabase db push` (histórico de produção desalinhado);
  aplicar o arquivo pela Management API + `migration repair`.

## Próximos passos (evolução)

1. **Devolver a qualificação ao Meta e ao Google** (item 4 original): CAPI do Meta
   (leadgen_id / ctwa_clid / fbclid + dados com hash) e conversões offline do Google
   (gclid). Antes: **definir MQL, SQL e venda** por etapa do funil.
2. **Webhook de Lead Ads do Meta** (item 2 original): formulário direto no Rev com
   leadgen_id e IDs — acaba com o `ag:` e com o "Importação / API".
3. **Funil por criativo até MQL/SQL**: colunas de MQL e SQL no Desempenho, custo por MQL
   e por SQL (depende do passo 1 para a definição).
4. **Alertas de Growth**: frequência > 3 (público cansado), gancho caindo, gasto sem
   lead em 3 dias, anúncio novo "a completar" — no sino/WhatsApp do time.
5. **Experimentos com cadência**: revisão semanal (o que rodou, bateu meta, próxima
   aposta), template de hipótese, histórico de aprendizados por canal e o resultado do
   experimento entrando no relatório diário.
6. **Programa de indicação completo**: link/código por indicador, recompensa, status da
   indicação e ranking no relatório; página pública de indicação.
7. **Eventos e parcerias como campanhas de primeira classe**: custo do evento/parceria,
   lista de presença importada, QR code com UTM por evento/parceiro.
8. **Google Ads**: conectar no Windsor da Solo e validar os campos por anúncio.
9. **Atribuição multi-toque**: hoje é primeiro toque; mostrar também último toque e o
   caminho do lead (anúncio → WhatsApp → visita → ganho).
10. **Mensagem padrão por anúncio no WhatsApp oficial**: com o número na API oficial, o
    `ctwa_clid` vem sempre e a CAPI de mensagens fica possível.
11. **Biblioteca de criativos**: vídeo/arte do estúdio ligado ao criativo (link do
    Drive/Canva), versão, e o ranking de criativos por custo por ganho para orientar o
    estúdio.
12. **API direta (Marketing API/Google Ads API)** se o volume justificar sair do Windsor.
