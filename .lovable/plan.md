
# Precision OS Design System - Plano de Implementação V2

## Filosofia Central: "Invisible Precision"

> *"O último grau da sofisticação é a simplicidade."* — Leonardo da Vinci

Este plano transforma o app de um "SaaS genérico" para um **"Pro Tool"** no estilo Linear, Raycast e Apple Developer Tools. O foco está na **subtração**: menos bordas, menos cores, menos ruído visual — deixando o conteúdo respirar.

---

## Pré-requisito: Corrigir Erro de Build

Antes de qualquer refatoração visual, o erro de TypeScript precisa ser resolvido:

**Arquivo:** `src/integrations/supabase/types.ts`
**Problema:** A coluna `is_crm_agent_enabled` existe no banco mas não nos tipos gerados.
**Solução:** Regenerar os tipos do Supabase ou adicionar a coluna manualmente na definição da tabela `equipes`.

---

## Fase 1: Fundação (CSS Variables & Fontes)

### 1.1 Atualizar `index.html`

Adicionar Google Fonts com Inter (UI) e JetBrains Mono (Dados):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 1.2 Atualizar `src/index.css`

**Mudanças Principais:**
- Background: `0 0% 98%` para `240 5% 96%` (off-white técnico ~#F4F4F6)
- Cards: Branco puro `0 0% 100%` (contraste com fundo)
- Borders: Mais sutis `220 13% 91%` (slate-200)
- Radius: `0.75rem` para `0.5rem` (cantos mais apertados)
- Novas utilities: `.glass`, `.glass-sidebar`, `.bg-grid-subtle`

**Nova Paleta Light Mode:**
```css
:root {
  --background: 240 5% 96%;      /* Off-white técnico */
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;              /* Branco puro */
  --border: 220 13% 91%;          /* Slate-200 sutil */
  --radius: 0.5rem;               /* Cantos precisos */
}
```

**Novas Utilities:**
```css
.glass {
  background: hsl(0 0% 100% / 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.bg-grid-subtle {
  background-image: radial-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px);
  background-size: 24px 24px;
}

.font-mono-data {
  font-family: 'JetBrains Mono', monospace;
  font-feature-settings: "tnum";
  letter-spacing: -0.02em;
}
```

### 1.3 Atualizar `tailwind.config.ts`

**Mudanças:**
- Remover `font-display: Sora` (não usado)
- Adicionar `font-mono: ['JetBrains Mono', 'monospace']`
- Manter `font-sans: ['Inter', 'system-ui', 'sans-serif']`

---

## Fase 2: Glassmorphism & Layout

### 2.1 `AppSidebar.tsx`

**Estado Ativo MacOS:**
- Trocar `bg-primary/10 text-primary` por `bg-slate-100 dark:bg-slate-800 text-foreground font-semibold`
- Adicionar efeito glass ao container da sidebar

### 2.2 `Header.tsx`

**Glass Header:**
- Adicionar `backdrop-blur-xl bg-white/80 dark:bg-black/60`
- Substituir shadow por border-b sutil

### 2.3 `InboxSidebar.tsx`

**Glass Panel:**
- Aplicar glass effect ao container
- Bordas mais sutis entre items

---

## Fase 3: Chat Experience Refinado

### 3.1 `Chat.tsx`

**Área de Mensagens:**
- Substituir `bg-muted/30` por `bg-grid-subtle` (pattern ultra-sutil 3%)
- Ou remover pattern completamente para máxima simplicidade

### 3.2 `MessageBubble.tsx`

**Bolhas Refinadas:**

| Sender   | Antes                          | Depois                                      |
|----------|--------------------------------|---------------------------------------------|
| Customer | `bg-muted`                     | `bg-white border border-slate-200`          |
| Agent    | `bg-primary text-white`        | `bg-primary text-white` (mantém)            |
| AI       | `bg-purple-100`                | `bg-purple-50 border border-purple-200`     |

- Reduzir radius de `rounded-2xl` para `rounded-xl`
- Timestamps em `font-mono-data`

### 3.3 `ChatInput.tsx`

**Input Flutuante Glass:**
```css
/* Novo estilo */
.chat-input-glass {
  @apply bg-white/90 dark:bg-slate-900/90;
  @apply backdrop-blur-xl;
  @apply border border-slate-200 dark:border-slate-700;
  @apply rounded-xl shadow-sm;
  @apply mx-3 mb-3;
}
```

### 3.4 `ChatListItem.tsx`

**Tipografia Mono para Dados:**
- Phone number: adicionar `font-mono text-xs`
- Timestamp: adicionar `font-mono`

---

## Fase 4: Componentes UI Primitivos

### 4.1 `button.tsx`

**Botões Mais Densos:**
- Default height: `h-10` para `h-9`
- Adicionar `ring-1 ring-inset ring-slate-200/50` para efeito "machined"
- Outline variant: border mais definido

### 4.2 `card.tsx`

**Cards Sem Shadow:**
- Remover `shadow-sm`
- Manter apenas `border border-slate-200`
- O contraste fundo off-white vs card branco é suficiente

---

## Fase 5: Tipografia de Dados

### 5.1 Onde Aplicar `font-mono`

| Componente        | Elemento           | Classe                    |
|-------------------|--------------------|---------------------------|
| LeadCard          | Telefone           | `font-mono text-xs`       |
| LeadCard          | Valor (R$)         | `font-mono font-semibold` |
| ChatListItem      | Telefone           | `font-mono text-xs`       |
| ChatListItem      | Timestamp          | `font-mono`               |
| DatabaseView      | Todas colunas num. | `font-mono`               |
| Dashboard         | KPI values         | `font-mono font-bold`     |
| MessageBubble     | Timestamp          | `font-mono text-[10px]`   |

---

## Resumo de Arquivos

| Arquivo | Ação | Prioridade |
|---------|------|------------|
| `src/integrations/supabase/types.ts` | Regenerar tipos | CRÍTICO (fix build) |
| `index.html` | Adicionar Google Fonts | Alta |
| `src/index.css` | Nova paleta + utilities | Alta |
| `tailwind.config.ts` | Font families | Alta |
| `src/components/AppSidebar.tsx` | Active state + glass | Média |
| `src/components/Header.tsx` | Glass header | Média |
| `src/components/inbox/MessageBubble.tsx` | Bubble styles | Média |
| `src/components/inbox/ChatInput.tsx` | Floating glass | Média |
| `src/pages/Chat.tsx` | Grid pattern | Média |
| `src/components/ui/button.tsx` | Denser buttons | Média |
| `src/components/ui/card.tsx` | Remove shadow | Média |
| `src/components/inbox/ChatListItem.tsx` | Mono typography | Baixa |
| `src/components/crm/LeadCard.tsx` | Mono typography | Baixa |
| `src/components/crm/DatabaseView.tsx` | Mono typography | Baixa |
| `src/pages/Dashboard.tsx` | Mono for KPIs | Baixa |

---

## Resultado Visual Esperado

```text
ANTES (Atual)                       DEPOIS (Precision OS)
+---------------------------+       +---------------------------+
| Fundo branco puro         |       | Fundo off-white técnico   |
| Cards com sombras         |       | Cards brancos sem shadow  |
| Bordas pesadas            |       | Bordas finíssimas (1px)   |
| Sidebar sólida            |       | Sidebar com glass blur    |
| Botões grandes (h-10)     |       | Botões densos (h-9)       |
| Fontes genéricas          |       | Mono para dados/números   |
| Chat colorido             |       | Chat minimalista          |
| Radius arredondado (xl)   |       | Radius preciso (lg)       |
+---------------------------+       +---------------------------+
```

---

## Notas Técnicas

1. **Glassmorphism Performance:** O `backdrop-blur` limitado a 12px é um bom equilíbrio entre visual e performance.

2. **Dark Mode:** Todas as mudanças terão variantes para `.dark` com cores ajustadas (slate-800/900 em vez de branco).

3. **Estratégia de Cor da Marca (Laranja):** Usada APENAS para:
   - Botões primários
   - Estados ativos
   - Badges de destaque
   - NÃO usar como fundo decorativo

4. **Hierarquia Tipográfica:** Em vez de bold em tudo, usar escalas de cinza (`text-muted-foreground`, `text-foreground`) para guiar o olho.
