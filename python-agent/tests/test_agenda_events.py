"""Tests for agenda_events tenant isolation (Sprint 6.7)."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MIGRATION_PATH = Path(__file__).resolve().parents[2] / "supabase/migrations/20260621004000_sprint67_agenda_events.sql"

def _read_migration():
    return open(MIGRATION_PATH).read()


def test_migration_has_rls_policy():
    sql = _read_migration()
    assert "CREATE POLICY" in sql
    assert "profiles" in sql
    assert "FOR ALL" in sql


def test_migration_has_range_index():
    sql = _read_migration()
    assert "idx_agenda_events_range" in sql
    assert "equipe_id, starts_at" in sql


def test_migration_has_type_check():
    sql = _read_migration()
    assert "CHECK" in sql
    assert "meeting" in sql
    assert "compromisso" in sql
    assert "block" in sql


def test_migration_has_task_fk():
    sql = _read_migration()
    assert "REFERENCES public.tasks" in sql


def test_migration_has_rls_enable():
    sql = _read_migration()
    assert "ENABLE ROW LEVEL SECURITY" in sql
