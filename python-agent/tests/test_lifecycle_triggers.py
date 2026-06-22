"""Tests for lifecycle-advance trigger rules (Sprint 6.7, Task 3.3).

These tests validate the **rule logic** in pure Python (no DB dependency).
The rules implemented here mirror the PL/pgSQL fn_advance_lifecycle trigger.
"""

import pytest


# ── rule helper (replicates PL/pgSQL fn_advance_lifecycle) ──────────────────

def _advance_lifecycle(lead: dict, context: dict | None = None) -> str:
    """Simulate lifecycle advancement rules in pure Python.

    Args:
        lead: { id, lifecycle_stage, email, personal_custom_data }
        context: { has_opportunity: bool, velocity: float }
    Returns:
        New lifecycle_stage (never downgrades automatically)
    """
    ctx = context or {}
    current = lead["lifecycle_stage"]
    stages = ["raw", "mql", "sql", "opportunity", "client", "lost"]
    current_idx = stages.index(current)

    # raw -> mql: has email AND has enrichment fields in personal_custom_data
    if current == "raw":
        email = lead.get("email")
        custom = lead.get("personal_custom_data", {})
        has_enrichment = any(
            v is not None and v != "" and v != 0 for v in custom.values()
        )
        if email and has_enrichment and current_idx < stages.index("mql"):
            return "mql"

    # mql -> sql: has opportunity AND velocity >= 10
    if current == "mql":
        if ctx.get("has_opportunity") and ctx.get("velocity", 0) >= 10:
            return "sql"

    # Never downgrade automatically
    return current


# ── tests ──────────────────────────────────────────────────────────────────


class TestLifecycleRawToMql:
    """raw -> mql: lead has email AND >=1 enrichment field."""

    def test_advances_when_has_email_and_enrichment(self):
        """raw lead with email + job_title in personal_custom_data -> mql."""
        lead = {
            "id": "u1",
            "lifecycle_stage": "raw",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        result = _advance_lifecycle(lead)
        assert result == "mql", f"Expected mql, got {result}"

    def test_stays_raw_without_email(self):
        """raw lead with no email -> stays raw."""
        lead = {
            "id": "u2",
            "lifecycle_stage": "raw",
            "email": None,
            "personal_custom_data": {"job_title": "Engineer"},
        }
        result = _advance_lifecycle(lead)
        assert result == "raw", f"Expected raw, got {result}"

    def test_stays_raw_without_enrichment(self):
        """raw lead with email but empty personal_custom_data -> stays raw."""
        lead = {
            "id": "u3",
            "lifecycle_stage": "raw",
            "email": "test@example.com",
            "personal_custom_data": {},
        }
        result = _advance_lifecycle(lead)
        assert result == "raw", f"Expected raw, got {result}"

    def test_stays_raw_with_only_empty_enrichment_values(self):
        """raw lead with email but enrichment values are all empty -> stays raw."""
        lead = {
            "id": "u4",
            "lifecycle_stage": "raw",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "", "linkedin_url": None},
        }
        result = _advance_lifecycle(lead)
        assert result == "raw", f"Expected raw, got {result}"


class TestLifecycleMqlToSql:
    """mql -> sql: has opportunity AND velocity >= 10."""

    def test_advances_when_has_opportunity_and_velocity(self):
        """mql lead with opportunity + velocity >= 10 -> sql."""
        lead = {
            "id": "u5",
            "lifecycle_stage": "mql",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        context = {"has_opportunity": True, "velocity": 10.0}
        result = _advance_lifecycle(lead, context)
        assert result == "sql", f"Expected sql, got {result}"

    def test_advances_with_high_velocity(self):
        """mql lead with opportunity + velocity > 10 -> sql."""
        lead = {
            "id": "u6",
            "lifecycle_stage": "mql",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        context = {"has_opportunity": True, "velocity": 25.0}
        result = _advance_lifecycle(lead, context)
        assert result == "sql", f"Expected sql, got {result}"

    def test_stays_mql_without_opportunity(self):
        """mql lead without opportunity -> stays mql."""
        lead = {
            "id": "u7",
            "lifecycle_stage": "mql",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        context = {"has_opportunity": False, "velocity": 10.0}
        result = _advance_lifecycle(lead, context)
        assert result == "mql", f"Expected mql, got {result}"

    def test_stays_mql_with_low_velocity(self):
        """mql lead with opportunity but velocity < 10 -> stays mql."""
        lead = {
            "id": "u8",
            "lifecycle_stage": "mql",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        context = {"has_opportunity": True, "velocity": 4.0}
        result = _advance_lifecycle(lead, context)
        assert result == "mql", f"Expected mql, got {result}"


class TestLifecycleNeverDowngrades:
    """Trigger must never downgrade automatically."""

    def test_sql_stays_sql_when_conditions_no_longer_met(self):
        """sql lead whose opportunity is gone -> stays sql (no downgrade)."""
        lead = {
            "id": "u9",
            "lifecycle_stage": "sql",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        context = {"has_opportunity": False, "velocity": 0.0}
        result = _advance_lifecycle(lead, context)
        assert result == "sql", f"Expected sql (no downgrade), got {result}"

    def test_opportunity_stays_opportunity_on_low_velocity(self):
        """opportunity-stage lead with low velocity -> stays opportunity."""
        lead = {
            "id": "u10",
            "lifecycle_stage": "opportunity",
            "email": "test@example.com",
            "personal_custom_data": {"job_title": "Engineer"},
        }
        context = {"has_opportunity": True, "velocity": 0.0}
        result = _advance_lifecycle(lead, context)
        assert result == "opportunity", (
            f"Expected opportunity (no downgrade), got {result}"
        )

    def test_client_stays_client(self):
        """client-stage lead -> stays client regardless of conditions."""
        lead = {
            "id": "u11",
            "lifecycle_stage": "client",
            "email": None,
            "personal_custom_data": {},
        }
        result = _advance_lifecycle(lead)
        assert result == "client", f"Expected client (no downgrade), got {result}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
