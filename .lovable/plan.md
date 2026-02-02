

# Transformação: Sidebar para Topbar + App Hub

## Visão Estratégica

Inspirado nas referências enviadas (Linear, Apple, Tesla, Basepoint), esta transformação move o app de um layout tradicional de "sidebar" para uma experiência mais limpa e focada com:

1. **Topbar Minimalista** — Navegação horizontal no estilo Apple/Tesla
2. **App Hub** — Página inicial como "launcher" explicando cada módulo
3. **Paleta Solo** — Cores vibrantes (#FF481E, #F2CE1F, #9E2A19) usadas como acentos sutis no hover

```text
ANTES                              DEPOIS
+--------+------------------+      +------------------------+
| SIDE   |                  |      | Logo  Nav  Nav  User   | ← Topbar Glass
| BAR    |    Conteúdo      |      +------------------------+
|        |                  |      |                        |
| Menu   |                  |      |      App Hub           | ← Cards com descrições
| Items  |                  |      |      (Home page)       |
|        |                  |      |                        |
+--------+------------------+      +------------------------+
```

---

## Arquitetura de Componentes

### Novos Componentes

| Componente | Descrição |
|------------|-----------|
| `TopNavbar.tsx` | Navegação horizontal fixa com glass effect |
| `UserMenu.tsx` | Dropdown do usuário (avatar, nome, logout) |
| `AppHubCard.tsx` | Card do App Hub com hover gradient |

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `App.tsx` | Remover SidebarProvider, usar TopNavbar |
| `Home.tsx` | Refatorar para App Hub com cards expandidos |
| `index.css` | Adicionar utilitários de hover gradient |
| `tailwind.config.ts` | Adicionar cores Solo (vermelho, laranja, amarelo) |

---

## Fase 1: Paleta Solo no Tailwind

### Cores a Adicionar (HSL)

```css
/* Paleta Solo Ventures */
--solo-orange: 14 100% 56%;      /* #FF481E */
--solo-yellow: 48 91% 53%;       /* #F2CE1F */
--solo-red: 8 59% 38%;           /* #9E2A19 */
--solo-gradient: linear-gradient(135deg, #FF481E, #F2CE1F);
```

### Uso Estratégico

- **Normal:** Preto/branco + cinza técnico
- **Hover:** Borda ou underline com cor Solo
- **Active:** Linha inferior com gradiente

---

## Fase 2: TopNavbar Component

### Design Visual

```text
+------------------------------------------------------------------+
| [Logo]    Início  Dashboard  Chat  CRM  Agente  ...    [Avatar]  |
+------------------------------------------------------------------+
          ↑ Links com hover underline gradiente
```

### Características

- Glass effect (`backdrop-blur-xl bg-white/80`)
- Height: `h-14` (mesmo tamanho atual)
- Links espaçados com `gap-8`
- Hover: underline ou borda inferior com gradiente Solo
- Active: texto mais escuro + linha inferior colorida
- Mobile: Menu hambúrguer com dropdown

### Dropdown de Usuário

- Avatar circular pequeno (32px)
- Click abre popover com:
  - Nome + Email
  - Role badge
  - Separator
  - Logout button

---

## Fase 3: App Hub (Nova Home)

### Layout Inspirado em Linear/Apple

```text
+----------------------------------------------------------+
|                                                          |
|    Solo Ventures Engine                                  |
|    Powered by [equipe.nome] • [user.nome]               |
|                                                          |
+----------------------------------------------------------+
|                                                          |
|  +-------------------+  +-------------------+            |
|  | [Icon]            |  | [Icon]            |            |
|  | Central de Chat   |  | Pipeline CRM      |            |
|  |                   |  |                   |            |
|  | Gerencie todas as |  | Visualize seu    |            |
|  | conversas do      |  | funil de vendas  |            |
|  | WhatsApp em um    |  | com drag-and-drop |           |
|  | só lugar.         |  | intuitivo.        |            |
|  +-------------------+  +-------------------+            |
|                                                          |
|  +-------------------+  +-------------------+  +-------+ |
|  | Dashboard         |  | Agente IA         |  | ...   | |
|  +-------------------+  +-------------------+  +-------+ |
|                                                          |
+----------------------------------------------------------+
```

### Cards do App Hub

Cada card terá:

1. **Ícone** — Lucide icon em círculo com gradiente sutil
2. **Título** — Nome do módulo
3. **Descrição** — 1-2 frases explicando a funcionalidade
4. **Hover Effect** — Borda ganha cor do gradiente Solo (2px)
5. **Badge** (opcional) — "Em Breve", "Novo", etc.

### Módulos com Descrições

| Módulo | Descrição |
|--------|-----------|
| **Central de Chat** | Gerencie todas as conversas do WhatsApp. Responda clientes, transfira para humanos e acompanhe em tempo real. |
| **Pipeline CRM** | Visualize seu funil de vendas com Kanban drag-and-drop. Mova leads entre etapas e nunca perca uma oportunidade. |
| **Dashboard** | Métricas de performance: leads, reuniões, no-shows, valor do pipeline. Exporte relatórios em CSV. |
| **Agente IA** | Configure o comportamento do seu agente de vendas. Treine com documentos e ajuste prompts. |
| **Webhooks** | Integre com sistemas externos via webhooks. Monitore logs e configure automações. |
| **Billing** | Gerencie créditos e assinatura. Compre pacotes via PIX ou cartão. |
| **Suporte** | Acesse suporte técnico e estratégico dedicado da Solo Ventures. |
| **Tutorial** | Aprenda a usar a plataforma com guias passo-a-passo e vídeos. |

---

## Fase 4: Hover Effects com Gradiente Solo

### CSS Utilities

```css
/* Hover com gradiente na borda */
.hover-gradient-border {
  position: relative;
}
.hover-gradient-border::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #FF481E, #F2CE1F);
  transform: scaleX(0);
  transition: transform 0.2s ease;
}
.hover-gradient-border:hover::after {
  transform: scaleX(1);
}

/* Card com borda hover */
.card-hover-solo:hover {
  border-color: #FF481E;
  box-shadow: 0 0 0 1px #FF481E20;
}
```

---

## Fase 5: Atualizar App.tsx

### Antes

```tsx
<SidebarProvider>
  <div className="min-h-screen flex w-full">
    <AppSidebar />
    <div className="flex-1 flex flex-col">
      <header>...</header>
      <main>{children}</main>
    </div>
  </div>
</SidebarProvider>
```

### Depois

```tsx
<div className="min-h-screen flex flex-col w-full bg-background">
  <TopNavbar />
  <main className="flex-1 flex flex-col overflow-hidden">
    {children}
  </main>
  <footer>...</footer>
</div>
```

---

## Fase 6: Responsividade Mobile

### TopNavbar Mobile

- Telas < 768px: Esconder links, mostrar menu hambúrguer
- Menu abre como Sheet (slide from right)
- Lista vertical com todos os links

### App Hub Mobile

- Cards em coluna única (1 col grid)
- Descrições permanecem visíveis

---

## Arquivos a Criar

| Arquivo | Tipo |
|---------|------|
| `src/components/TopNavbar.tsx` | Novo componente |
| `src/components/UserMenu.tsx` | Novo componente |
| `src/components/AppHubCard.tsx` | Novo componente |

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/App.tsx` | Remover Sidebar, usar TopNavbar |
| `src/pages/Home.tsx` | Refatorar para App Hub |
| `src/index.css` | Adicionar utilities de hover gradient |
| `tailwind.config.ts` | Adicionar cores Solo |

## Arquivos a Remover (Opcional - Fase Futura)

| Arquivo | Motivo |
|---------|--------|
| `src/components/AppSidebar.tsx` | Substituído por TopNavbar |
| `src/components/Header.tsx` | Mesclado com TopNavbar |

---

## Preview Visual Esperado

```text
+------------------------------------------------------------------+
| [Solo Logo]  Início  Dashboard  Chat  CRM  •••    [◯ Avatar]     |
+------------------------------------------------------------------+
|                                                                  |
|              Solo Ventures Engine                                |
|              Seu sistema de vendas inteligente                   |
|                                                                  |
|    +-------------------------+  +-------------------------+      |
|    |   💬                    |  |   📊                    |      |
|    |   Central de Chat       |  |   Pipeline CRM          |      |
|    |                         |  |                         |      |
|    |   Gerencie conversas    |  |   Funil de vendas com   |      |
|    |   do WhatsApp em um     |  |   drag-and-drop         |      |
|    |   só lugar.             |  |   intuitivo.            |      |
|    +-------------------------+  +-------------------------+      |
|                                                                  |
|    +-------------------------+  +-------------------------+      |
|    |   📈 Dashboard          |  |   🤖 Agente IA          |      |
|    +-------------------------+  +-------------------------+      |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Notas Técnicas

1. **Remoção do SidebarProvider**: O layout atual usa `SidebarProvider` que controla estado da sidebar. Será removido completamente.

2. **Glassmorphism Topbar**: Manter consistência com o design "Precision OS" já implementado.

3. **Role-based Navigation**: A lógica de `hasRole()` e `isSuperAdmin()` será mantida para controlar quais itens aparecem na TopNavbar.

4. **External Links**: Links externos (como Chat externo) continuarão abrindo em nova aba com ícone indicativo.

5. **Paleta Solo como Accent**: As cores vibrantes (#FF481E, #F2CE1F) serão usadas APENAS para:
   - Hover states
   - Active indicators
   - Badges especiais
   - Nunca como cor de fundo sólida

