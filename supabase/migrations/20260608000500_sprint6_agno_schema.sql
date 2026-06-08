-- ============================================================================
-- Sprint 6 · B6 — Agno session/memory schema
-- Agno creates its own tables at runtime. This migration only provisions the
-- dedicated schema and service-role grants.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agno;

COMMENT ON SCHEMA agno IS
  'Sprint 6: service-role-only schema for Agno session and memory persistence. Not exposed to client RLS.';

GRANT USAGE, CREATE ON SCHEMA agno TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA agno
  GRANT EXECUTE ON FUNCTIONS TO service_role;

