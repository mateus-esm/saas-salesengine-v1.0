-- Sprint 8.2 · discovery_q&a · T71 — onde as respostas moram.
--
-- Uma linha por onboarding. O token é guardado como HASH, como em
-- custom_record_form_links: o link aparece uma vez, na hora de gerar. Gerar
-- outro invalida o anterior — mas NÃO apaga resposta nenhuma, porque as
-- respostas são da linha, não do link. Reenviar o link para quem trocou de
-- e-mail é seguro.
--
-- Sem trigger em `onboardings`: quem cria a linha é _discovery_ensure_link
-- (T72). Um trigger criaria a linha, mas o token em claro só existe dentro da
-- transação que o gerou — e é ele que precisa chegar à mensagem de boas-vindas.

create table if not exists public.onboarding_discovery (
  id            uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null unique references public.onboardings(id) on delete cascade,
  token_hash    text unique,
  expires_at    timestamptz,
  answers       jsonb not null default '{}'::jsonb,
  progress      int not null default 0,
  status        text not null default 'draft'  check (status in ('draft','submitted')),
  source        text not null default 'form'   check (source in ('form','json_import','copilot')),
  submitted_at  timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.onboarding_discovery enable row level security;

-- Só quem enxerga o quadro de onboarding enxerga o discovery: super admin.
drop policy if exists onboarding_discovery_admin_read on public.onboarding_discovery;
create policy onboarding_discovery_admin_read on public.onboarding_discovery
  for select to authenticated using (public.is_super_admin());
-- Sem política de escrita: quem grava são os verbos security definer.

-- Uma resposta "existe"?
--
-- Multi responde com lista: lista vazia é não respondida. Texto responde com
-- string: espaço em branco é não respondida. Sem isso o progresso contaria um
-- campo limpo pelo cliente como preenchido.
create or replace function public._discovery_has_answer(p_type text, p_value jsonb)
returns boolean language sql immutable as $$
  select case
    when p_value is null or p_value = 'null'::jsonb then false
    when p_type = 'multi' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0
    else btrim(coalesce(p_value #>> '{}', '')) <> ''
  end;
$$;

-- O percentual de obrigatórias respondidas, contra o banco de perguntas DO
-- NICHO do cliente — uma pergunta de energia solar não pode contar contra um
-- escritório de advocacia, que nem a vê.
create or replace function public._discovery_progress(p_answers jsonb, p_niche text)
returns int language sql stable as $$
  select coalesce((
    select round(100.0 * count(*) filter (
             where public._discovery_has_answer(q.type, p_answers -> q.code)
           ) / nullif(count(*), 0))::int
      from public.discovery_questions q
     where q.active and q.required
       and (q.niche_id is null or q.niche_id = p_niche)
  ), 0);
$$;

create or replace function public._discovery_touch() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists onboarding_discovery_touch on public.onboarding_discovery;
create trigger onboarding_discovery_touch
  before update on public.onboarding_discovery
  for each row execute function public._discovery_touch();

comment on table public.onboarding_discovery is
  'Sprint 8.2 discovery_q&a — respostas do discovery, uma linha por onboarding.';
