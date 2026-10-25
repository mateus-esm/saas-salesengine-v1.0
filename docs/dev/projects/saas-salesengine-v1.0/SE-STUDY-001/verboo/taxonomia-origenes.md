# Taxonomia de origens — design MECE e mapeamento (Q3)

> Arquivo de apoio de `estudio-migracion-solo-energia.md` · SE-STUDY-001 · 2026-09-10
> Fonte: `evidence-data.md` (13 valores reais) + `scripts/migrate_solo_energia.py` (mapa `ORIGIN_CATEGORY`) + `src/config/originTaxonomy.ts` (grupos MECE) + `20260601000100_sprint5_2_origin_taxonomy.sql` (tabela) + `20260830000500_sprint9_canonical_channel.sql` (decisão canônica).

---

## 1. O problema

Um lead da Solo Energia hoje responde "de onde veio?" com **seis colunas**:

| Coluna | Quem escreve | Natureza |
| :--- | :--- | :--- |
| `origin_category` | Migração Sprint 10 / AddContactModal | Enum MECE de 12 com CHECK — **a única confiável para agrupar** |
| `origin_detail` | Migração Sprint 10 | Texto livre que preserva o rótulo bruto |
| `origin` | Sprint 3 (legado) | Texto livre |
| `source` | AddContactModal / webhooks (legado) | Texto livre |
| `origem` | Legado (ortografia PT) | Texto livre |
| `channel` | solo-wpp-webhook | **NÃO é origem** — é canal de contato (inbox: whatsapp/instagram) |

Agrupar por qualquer uma delas gera um gráfico diferente. A decisão já está escrita no Sprint 9 (`20260830000500_sprint9_canonical_channel.sql`): **canônico = `origin_category` + `origin_detail`**, e a view expõe `acquisition_channel` (de onde veio) vs `contact_channel` (como conversamos) para que não se confundam.

Além disso, a tabela `origin_taxonomy` (Sprint 5.2) está **vazia**: o editor `OriginTaxonomyEditor.tsx` existe, mas não tem linhas para mostrar.

---

## 2. Design MECE

A taxonomia é um superset de 12 categorias em 4 grupos (já definidos em `src/config/originTaxonomy.ts`):

```
inbound   (el cliente viene a nosotros)
├── organic_search   Busca Orgánica
├── organic_social   Social Orgánico
├── paid_search      Busca Paga
├── paid_social      Social Pago
└── direct_brand     Directo / Marca

outbound  (nosotros vamos al cliente)
├── outbound_phone   Cold Call
├── outbound_message Cold Message
└── outbound_email   Cold Email

network   (terceros)
├── referral         Indicación
├── partner_channel  Parceiro / Canal
└── offline_event    Evento Offline

system    (máquina)
└── api_import       Importación / API
```

Propriedades MECE:
- **Mutualmente exclusivas:** cada categoria responde a uma pergunta distinta (pagou? orgânico? rede? sistema?). `paid_social` vs `organic_social` se separam pelo pagamento; `direct_brand` é "escreveu/marcou diretamente" (inclui landing própria e marca).
- **Coletivamente exaustivas:** as 12 cobrem todo canal de aquisição razoável; `api_import` é a rede de segurança para dados importados/migrados.
- **`origin_detail`** guarda o rótulo bruto do cliente (ex.: "Landing Page - LL") para não perder a linguagem dele; a categoria classifica.

---

## 3. Mapeamento dos 13 valores reais

| `source`/`origem` (Jestor) | Contados | `origin_category` | Grupo | Notas |
| :--- | ---: | :--- | :--- | :--- |
| Tráfego Pago | 640 | `paid_social` | inbound | A maior parte do funil — campanhas Meta |
| Mensagem Whatsapp | 221 | `outbound_message` | outbound | Prospecção por WhatsApp (inbox) |
| Database | 87 | `api_import` | system | Base comprada/própria importada |
| Indicação | 83 | `referral` | network | — |
| Jestor | 59 | `api_import` | system | **Artefato de migração, não canal real** — remapear |
| Base Ativa | 54 | `outbound_message` | outbound | Prospecção sobre base própria |
| Landing Page - LL | 36 | `direct_brand` | inbound | Landing própria (Lead Magnet) |
| Prospecção Ativa | 35 | `outbound_phone` | outbound | Cold call |
| Site | 14 | `direct_brand` | inbound | — |
| Google ADS | 12 | `paid_search` | inbound | — |
| Lead Magnet - Billing | 5 | `direct_brand` | inbound | Ímã de leads próprio |
| Lead Magnet - Billing (Partner) | 3 | `partner_channel` | network | Ímã de leads de parceiro |
| Solo App | 2 | `api_import` | system | App própria |

O mapa é o do próprio script (`migrate_solo_energia.py:55-68`), com default `api_import` para rótulos fora do dicionário.

**Distribuição resultante por `origin_category` (evidência):**
`paid_social` 640 · `outbound_message` 275 · `api_import` 148 · `referral` 83 · `direct_brand` 55 · `outbound_phone` 35 · `paid_search` 12 · `partner_channel` 3.
(Nota: a evidência reporta `outbound_message` 275 = 221 Mensagem Whatsapp + 54 Base Ativa; `direct_brand` 55 = 36 LL + 14 Site + 5 Lead Magnet; `api_import` 148 = 87 Database + 59 Jestor + 2 Solo App.)

---

## 4. Ações propostas

1. **Semear `origin_taxonomy`** com os 13 rótulos brutos (`kind='origem'`, `label` = rótulo, `color` por grupo) e os canais de contato (`kind='canal'`: whatsapp, site, instagram). O editor de UI e o dashboard passam a funcionar sem código novo.
2. **Manter o CHECK de 12** como enum canônico (não ampliar; é superset suficiente).
3. **Remapear "Jestor" (59):** é base importada, não canal. Deixar `origin_category='api_import'` + `origin_detail='Jestor'` e documentar que significa "base migrada".
4. **Parar de escrever `source`/`origem`** em código novo (AddContactModal, webhooks) e migrar leituras para a view `acquisition_channel`/`contact_channel` do Sprint 9.
5. **Regra de negócio:** a origem é atributo do **contato** (identidade), não da oportunidade. Promover `custom_data.fonte` da migração para `leads.origin_category`/`origin_detail` quando a oportunidade for a única fonte.
6. **`channel` permanece como canal de contato** — nunca misturá-lo em gráficos de aquisição (a armadilha documentada no Sprint 9: reportaria "90% vem de WhatsApp", que é o inbox, não o marketing).