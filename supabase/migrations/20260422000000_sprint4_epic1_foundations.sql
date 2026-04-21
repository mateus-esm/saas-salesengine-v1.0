-- ============================================================================
-- Sprint 4 · EPIC 1 — Foundations (Associations + Agent Rules Schema)
--
-- Purpose: lay down the enterprise domain model without touching UI. Every
-- table here is additive; no drops, no renames. RLS uses the standard
-- equipe_id-via-profiles pattern (mirrors Sprint 3 EPIC 2 migration).
--
-- What ships:
--   1. leads extensions        — contact_type, personal_custom_data,
--                                created_by_*, origin_category/detail
--   2. companies               — business entity (CRUD lands in Epic 4)
--   3. properties              — asset entity (sites/units/addresses)
--   4. link tables             — contact↔company, property↔owner, opp↔*
--   5. pipeline_agent_rules    — structured triggers + NL hints (UI in Epic 5)
--   6. ai_decisions.rule_id    — audit pointer to a rule (Epic 5 populates)
--
-- Convention: see /db/CONVENTIONS.md and 20260419110000_epic2_pipelines.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. leads — identity-layer extensions (additive only)
-- ============================================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'lead'
    CHECK (contact_type IN ('lead','opportunity','contact','spam','archived')),
  ADD COLUMN IF NOT EXISTS personal_custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by_type text DEFAULT 'team'
    CHECK (created_by_type IN ('team','automation','ai','import','webhook')),
  ADD COLUMN IF NOT EXISTS created_by_id uuid,
  ADD COLUMN IF NOT EXISTS origin_category text
    CHECK (origin_category IN (
      'organic_search','organic_social','paid_search','paid_social',
      'direct_brand','outbound_phone','outbound_message','outbound_email',
      'referral','partner_channel','offline_event','api_import'
    )),
  ADD COLUMN IF NOT EXISTS origin_detail text;

COMMENT ON COLUMN public.leads.contact_type IS
  'Sprint 4 EPIC 1: lifecycle flag. Independent from opportunities.status.';
COMMENT ON COLUMN public.leads.personal_custom_data IS
  'Sprint 4 EPIC 1: identity-level enrichment (birthday, LinkedIn, etc.). Per-pipeline sales data stays on opportunities.custom_data.';
COMMENT ON COLUMN public.leads.origin_category IS
  'Sprint 4 EPIC 1: MECE origin taxonomy. Authoritative source; legacy origin text column stays for dual-read until Sprint 5.';

CREATE INDEX IF NOT EXISTS idx_leads_contact_type_live
  ON public.leads (equipe_id, contact_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_origin_category_live
  ON public.leads (equipe_id, origin_category)
  WHERE deleted_at IS NULL AND origin_category IS NOT NULL;

-- ============================================================================
-- 2. companies — business entity
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id       uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,

  name            text NOT NULL,
  legal_name      text,
  cnpj            text,
  website         text,
  industry        text,
  size_bracket    text CHECK (size_bracket IN ('solo','2-10','11-50','51-200','201-1000','1000+')),

  custom_data     jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

COMMENT ON TABLE public.companies IS
  'Sprint 4 EPIC 1: Tier-1 business entity. Linked to contacts via contact_company_links.';

CREATE INDEX IF NOT EXISTS idx_companies_equipe_name_live
  ON public.companies (equipe_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_equipe_cnpj_live
  ON public.companies (equipe_id, cnpj) WHERE deleted_at IS NULL AND cnpj IS NOT NULL;

-- ============================================================================
-- 3. properties — agnostic asset (site, unit, address)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id       uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,

  label           text NOT NULL,
  property_type   text NOT NULL DEFAULT 'address'
                  CHECK (property_type IN ('address','site','unit','custom')),

  address         jsonb,
  latitude        numeric(10,7),
  longitude       numeric(10,7),

  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

COMMENT ON TABLE public.properties IS
  'Sprint 4 EPIC 1: Tier-1 asset entity. Polymorphic owner via property_owner_links.';

CREATE INDEX IF NOT EXISTS idx_properties_equipe_live
  ON public.properties (equipe_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_equipe_type_live
  ON public.properties (equipe_id, property_type) WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. Association tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contact_company_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id    uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  contact_id   uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'employee'
               CHECK (role IN ('owner','decision_maker','employee','former','advisor','other')),
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (contact_id, company_id, role)
);

COMMENT ON TABLE public.contact_company_links IS
  'Sprint 4 EPIC 1: many-to-many contact↔company with role. is_primary flags the main affiliation.';

CREATE INDEX IF NOT EXISTS idx_ccl_contact_live
  ON public.contact_company_links (contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ccl_company_live
  ON public.contact_company_links (company_id) WHERE deleted_at IS NULL;

-- Polymorphic owner. owner_id is validated in app layer; RLS + equipe_id
-- scoping prevents cross-tenant leakage.
CREATE TABLE IF NOT EXISTS public.property_owner_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id     uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_type    text NOT NULL CHECK (owner_type IN ('contact','company')),
  owner_id      uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (property_id, owner_type, owner_id)
);

COMMENT ON TABLE public.property_owner_links IS
  'Sprint 4 EPIC 1: polymorphic link — a property may be owned by contacts and/or companies.';

CREATE INDEX IF NOT EXISTS idx_pol_owner_live
  ON public.property_owner_links (owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pol_property_live
  ON public.property_owner_links (property_id) WHERE deleted_at IS NULL;

-- An opportunity's supporting cast (co-buyers, attached companies/properties).
CREATE TABLE IF NOT EXISTS public.opportunity_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id       uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  linked_type     text NOT NULL CHECK (linked_type IN ('company','property','contact')),
  linked_id       uuid NOT NULL,
  relation        text NOT NULL DEFAULT 'related',
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (opportunity_id, linked_type, linked_id, relation)
);

COMMENT ON TABLE public.opportunity_links IS
  'Sprint 4 EPIC 1: secondary attachments on opportunities. Primary contact stays on opportunities.lead_id.';

CREATE INDEX IF NOT EXISTS idx_opp_links_opp_live
  ON public.opportunity_links (opportunity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opp_links_linked_live
  ON public.opportunity_links (linked_type, linked_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 5. pipeline_agent_rules — structured triggers + NL hints
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pipeline_agent_rules (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id                   uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  pipeline_id                 uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,

  triggers                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraction_hints            text,

  auto_create_opportunity     boolean NOT NULL DEFAULT false,
  auto_advance_stages         boolean NOT NULL DEFAULT true,
  auto_extract_custom_fields  boolean NOT NULL DEFAULT true,
  cooldown_minutes            integer NOT NULL DEFAULT 3,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id)
);

COMMENT ON TABLE public.pipeline_agent_rules IS
  'Sprint 4 EPIC 1: per-pipeline agent config. One row per pipeline. Triggers are the contract; extraction_hints is the garnish.';
COMMENT ON COLUMN public.pipeline_agent_rules.triggers IS
  'JSON array of {id,name,when:{type,...},do:[{action,...}],active}. See sprint_4_crm_v1.md §1.6 and Epic 5.';

CREATE INDEX IF NOT EXISTS idx_par_pipeline
  ON public.pipeline_agent_rules (pipeline_id);

DROP TRIGGER IF EXISTS set_pipeline_agent_rules_updated_at ON public.pipeline_agent_rules;
CREATE TRIGGER set_pipeline_agent_rules_updated_at
  BEFORE UPDATE ON public.pipeline_agent_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. updated_at triggers for companies / properties
-- ============================================================================
DROP TRIGGER IF EXISTS set_companies_updated_at ON public.companies;
CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_properties_updated_at ON public.properties;
CREATE TRIGGER set_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 7. ai_decisions.rule_id — audit pointer
-- ============================================================================
-- The rule lives inside pipeline_agent_rules.triggers[].id (JSON), not its own
-- table, so no FK. Nullable — legacy decisions have no rule to reference.
ALTER TABLE public.ai_decisions
  ADD COLUMN IF NOT EXISTS rule_id uuid;

COMMENT ON COLUMN public.ai_decisions.rule_id IS
  'Sprint 4 EPIC 1: id of the pipeline_agent_rules.triggers[] entry that fired. NULL for pre-Epic-5 decisions.';

CREATE INDEX IF NOT EXISTS idx_ai_decisions_rule_id
  ON public.ai_decisions (rule_id) WHERE rule_id IS NOT NULL;

-- ============================================================================
-- 8. Row Level Security — same pattern as Sprint 3 EPIC 2
-- ============================================================================
ALTER TABLE public.companies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_company_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_owner_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_agent_rules   ENABLE ROW LEVEL SECURITY;

-- companies
DROP POLICY IF EXISTS "Users can view their team companies" ON public.companies;
CREATE POLICY "Users can view their team companies"
  ON public.companies FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team companies" ON public.companies;
CREATE POLICY "Users can manage their team companies"
  ON public.companies FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- properties
DROP POLICY IF EXISTS "Users can view their team properties" ON public.properties;
CREATE POLICY "Users can view their team properties"
  ON public.properties FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team properties" ON public.properties;
CREATE POLICY "Users can manage their team properties"
  ON public.properties FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- contact_company_links
DROP POLICY IF EXISTS "Users can view their team ccl" ON public.contact_company_links;
CREATE POLICY "Users can view their team ccl"
  ON public.contact_company_links FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team ccl" ON public.contact_company_links;
CREATE POLICY "Users can manage their team ccl"
  ON public.contact_company_links FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- property_owner_links
DROP POLICY IF EXISTS "Users can view their team pol" ON public.property_owner_links;
CREATE POLICY "Users can view their team pol"
  ON public.property_owner_links FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team pol" ON public.property_owner_links;
CREATE POLICY "Users can manage their team pol"
  ON public.property_owner_links FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- opportunity_links
DROP POLICY IF EXISTS "Users can view their team opp links" ON public.opportunity_links;
CREATE POLICY "Users can view their team opp links"
  ON public.opportunity_links FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team opp links" ON public.opportunity_links;
CREATE POLICY "Users can manage their team opp links"
  ON public.opportunity_links FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- pipeline_agent_rules
DROP POLICY IF EXISTS "Users can view their team agent rules" ON public.pipeline_agent_rules;
CREATE POLICY "Users can view their team agent rules"
  ON public.pipeline_agent_rules FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team agent rules" ON public.pipeline_agent_rules;
CREATE POLICY "Users can manage their team agent rules"
  ON public.pipeline_agent_rules FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

COMMIT;
