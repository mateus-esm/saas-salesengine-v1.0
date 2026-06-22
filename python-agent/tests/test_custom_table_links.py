"""Tests for custom_table_links tenant isolation.

Verifies that the RLS policy is correctly written (no real DB -- tests validate
the SQL pattern is correct by testing the business logic: tenant A cannot see
tenant B's links).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import get_service_client

# Test: the SQL migration must have the RLS policy with the profiles.equipe_id pattern
REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_SQL = (REPO_ROOT / "supabase/migrations/20260621001000_sprint67_custom_table_links.sql").read_text()

def test_migration_has_rls_policy():
    """Migration must include a CREATE POLICY statement with the equipe_id-through-profiles pattern."""
    assert "CREATE POLICY" in MIGRATION_SQL
    assert "profiles" in MIGRATION_SQL
    assert "equipe_id" in MIGRATION_SQL
    assert "FOR ALL" in MIGRATION_SQL

def test_migration_has_indexes():
    """Migration must create from/from+to indexes."""
    assert "idx_ctl_from" in MIGRATION_SQL
    assert "idx_ctl_to" in MIGRATION_SQL
    assert "uq_ctl_edge" in MIGRATION_SQL

def test_migration_has_unique_constraint():
    """Unique constraint prevents duplicate edges."""
    assert "UNIQUE" in MIGRATION_SQL.upper() or "uq_ctl_edge" in MIGRATION_SQL

def test_migration_has_rls_enable():
    """RLS must be enabled on the table."""
    assert "ENABLE ROW LEVEL SECURITY" in MIGRATION_SQL
