---
description: Workflow completo para desenvolvimento e deploy com Supabase CLI
---

# Supabase Local Development Workflow

## Pré-requisitos
- Docker Desktop instalado e **rodando**
- Supabase CLI instalado via Scoop

## 1. Setup Inicial (Primeira vez)

// turbo
```powershell
# Verificar versão do CLI
supabase --version
```

```powershell
# Login no Supabase (abre browser)
supabase login
```

```powershell
# Vincular ao projeto remoto (substitua pelo seu project-ref)
cd "c:\Users\mateus\SaaS Sales Engine - v1.0 (Supabase)\saas-salesengine-v1.0"
supabase link --project-ref SEU_PROJECT_REF
```

> **Onde encontrar o project-ref:** Dashboard → Settings → General → Reference ID

---

## 2. Desenvolvimento Local (com Docker)

### Iniciar ambiente local
```powershell
supabase start
```
Isso sobe: Postgres, Auth, Storage, Realtime, Edge Functions localmente.

### Parar ambiente local
```powershell
supabase stop
```

### Ver status
```powershell
supabase status
```

---

## 3. Migrations (Banco de Dados)

### Criar nova migration
```powershell
supabase migration new nome_da_migration
```

### Aplicar migrations localmente
```powershell
supabase db reset
```

### Push migrations para produção
// turbo
```powershell
supabase db push
```

### Pull schema do remoto
```powershell
supabase db pull
```

---

## 4. Edge Functions

### Servir localmente (hot reload)
```powershell
supabase functions serve
```

### Servir função específica
```powershell
supabase functions serve analyze-message --env-file supabase/.env.local
```

### Deploy para produção
// turbo
```powershell
supabase functions deploy analyze-message
supabase functions deploy gpt-maker-webhook
```

### Deploy todas as funções
// turbo
```powershell
supabase functions deploy
```

---

## 5. Secrets (Variáveis de Ambiente)

### Definir secret
```powershell
supabase secrets set OPENAI_API_KEY=sk-sua-chave
supabase secrets set GPT_MAKER_TOKEN=seu-token
```

### Listar secrets
```powershell
supabase secrets list
```

### Para desenvolvimento local, criar arquivo:
Criar `supabase/.env.local`:
```
OPENAI_API_KEY=sk-sua-chave-aqui
GPT_MAKER_TOKEN=seu-token-aqui
```

---

## 6. Gerar Types (TypeScript)

// turbo
```powershell
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

---

## 7. Logs em Tempo Real

```powershell
supabase functions logs analyze-message --tail
```

---

## 8. Troubleshooting

### Erro: "Address already in use"
```powershell
supabase stop
docker stop $(docker ps -q)
```

### Resetar tudo
```powershell
supabase stop --no-backup
supabase start
```

### Verificar Docker
```powershell
docker ps
```
