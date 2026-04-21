-- ============================================================================
-- Sprint 4 · EPIC 0 — QA seed
--
-- Creates: 2 demo tenants × 2 pipelines × 30 opportunities × 60 contacts.
-- DEV-ONLY. Idempotent: guarded by a marker prefix on equipes.nome so re-runs
-- don't duplicate. Uses only tables that exist after Sprint 3 + this sprint's
-- cutover migration.
--
-- Usage: psql "$SUPABASE_DB_URL" -f supabase/seed/sprint4_epic0_seed.sql
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t_idx         integer;
  p_idx         integer;
  s_idx         integer;
  c_idx         integer;
  o_idx         integer;

  v_equipe_id   uuid;
  v_equipe_name text;

  v_pipeline_id uuid;
  v_stage_id    uuid;
  v_contact_id  uuid;

  stages        uuid[];
  contact_ids   uuid[];

  stage_types   text[] := ARRAY['open','open','open','won','lost'];
  stage_names   text[] := ARRAY['Novo Lead','Qualificação','Reunião Agendada','Ganho','Perdido'];
BEGIN
  FOR t_idx IN 1..2 LOOP
    v_equipe_name := 'QA Tenant ' || t_idx || ' [sprint4-epic0]';

    -- 1. Find-or-create equipe.
    SELECT id INTO v_equipe_id FROM public.equipes WHERE nome = v_equipe_name;
    IF v_equipe_id IS NOT NULL THEN
      RAISE NOTICE 'Equipe % já existe (id=%), pulando seed para este tenant.',
        v_equipe_name, v_equipe_id;
      CONTINUE;
    END IF;

    INSERT INTO public.equipes (nome, niche)
    VALUES (v_equipe_name, CASE WHEN t_idx = 1 THEN 'solar' ELSE 'b2b' END)
    RETURNING id INTO v_equipe_id;

    -- 2. Two pipelines per tenant, each with 5 stages.
    FOR p_idx IN 1..2 LOOP
      INSERT INTO public.pipelines (equipe_id, name, description)
      VALUES (
        v_equipe_id,
        CASE WHEN p_idx = 1 THEN 'Funil Principal' ELSE 'Funil Secundário' END,
        'Seed Sprint 4 EPIC 0'
      )
      RETURNING id INTO v_pipeline_id;

      stages := ARRAY[]::uuid[];
      FOR s_idx IN 1..array_length(stage_types, 1) LOOP
        INSERT INTO public.pipeline_stages_v2
          (equipe_id, pipeline_id, name, position, stage_type)
        VALUES
          (v_equipe_id, v_pipeline_id, stage_names[s_idx], s_idx, stage_types[s_idx])
        RETURNING id INTO v_stage_id;
        stages := stages || v_stage_id;
      END LOOP;

      -- First pipeline becomes the tenant's default.
      IF p_idx = 1 THEN
        UPDATE public.equipes
           SET default_pipeline_id = v_pipeline_id
         WHERE id = v_equipe_id;
      END IF;
    END LOOP;

    -- 3. 60 contacts per tenant.
    contact_ids := ARRAY[]::uuid[];
    FOR c_idx IN 1..60 LOOP
      INSERT INTO public.leads
        (equipe_id, name, phone, email, lead_type, source, origem, creation_source)
      VALUES (
        v_equipe_id,
        'Contato ' || t_idx || '-' || c_idx,
        '+5511' || lpad((900000000 + t_idx*100000 + c_idx)::text, 9, '0'),
        'qa' || t_idx || '_' || c_idx || '@seed.local',
        'lead',
        'seed',
        'seed',
        'manual'
      )
      RETURNING id INTO v_contact_id;
      contact_ids := contact_ids || v_contact_id;
    END LOOP;

    -- 4. 30 opportunities per pipeline (2 × 30 = 60 per tenant). Contacts are
    --    reused so a contact can own multiple opportunities across pipelines.
    FOR p_idx IN 1..2 LOOP
      SELECT p.id INTO v_pipeline_id
      FROM public.pipelines p
      WHERE p.equipe_id = v_equipe_id
        AND p.name = CASE WHEN p_idx = 1 THEN 'Funil Principal' ELSE 'Funil Secundário' END
      LIMIT 1;

      SELECT array_agg(s.id ORDER BY s.position) INTO stages
      FROM public.pipeline_stages_v2 s
      WHERE s.pipeline_id = v_pipeline_id
        AND s.deleted_at IS NULL;

      FOR o_idx IN 1..30 LOOP
        INSERT INTO public.opportunities
          (equipe_id, lead_id, pipeline_id, stage_id, value, status, custom_data)
        VALUES (
          v_equipe_id,
          contact_ids[1 + (o_idx % array_length(contact_ids, 1))],
          v_pipeline_id,
          stages[1 + (o_idx % array_length(stages, 1))],
          1000 + (o_idx * 137),
          CASE
            WHEN (o_idx % array_length(stages, 1)) = 3 THEN 'won'
            WHEN (o_idx % array_length(stages, 1)) = 4 THEN 'lost'
            ELSE 'open'
          END,
          jsonb_build_object('seed', true, 'batch', 'sprint4-epic0')
        );
      END LOOP;
    END LOOP;

    RAISE NOTICE 'Seed completo para equipe % (id=%).', v_equipe_name, v_equipe_id;
  END LOOP;
END;
$$;

COMMIT;
