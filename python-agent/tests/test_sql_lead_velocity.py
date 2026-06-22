"""Real SQL-backed tests for fn_calculate_lead_velocity.

Calls the actual PL/pgSQL function against PostgreSQL, not a Python mirror.
Skipped when DATABASE_URL is not set.
"""

from __future__ import annotations

import uuid

import pytest

from conftest import TEST_EQUIPE_ID


pytestmark = pytest.mark.db
_EQ = TEST_EQUIPE_ID  # valid UUID from production tenant


class TestLeadVelocitySQL:
    """Tests velocity formula directly via SQL: S = (n × 10) − (2.0 × t), floor 0."""

    def _setup_activity(self, db, lead_id: str, days_ago: int):
        """Insert a lead_activity row, then set its created_at to days_ago."""
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                   VALUES (%s, %s, 'test', 'test-activity')""",
                (str(uuid.uuid4()), lead_id),
            )
            cur.execute(
                "UPDATE lead_activities SET created_at = NOW() - %s::interval WHERE lead_id = %s",
                (f"{days_ago} days", lead_id),
            )

    def test_no_activity_returns_zero(self, db):
        """Lead with no activities at all → velocity = 0."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            cur.execute(
                "SELECT fn_calculate_lead_velocity(%s)",
                (lead_id,),
            )
            result = cur.fetchone()[0]
        assert result == 0.0

    def test_single_activity_today_returns_10(self, db):
        """1 activity today → 1 × 10 − (2.0 × 0) = 10."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            cur.execute(
                f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                   VALUES (%s, %s, 'email', 'opened')""",
                (str(uuid.uuid4()), lead_id),
            )
            cur.execute("SELECT fn_calculate_lead_velocity(%s)", (lead_id,))
            assert cur.fetchone()[0] == 10.0

    def test_three_activities_today_returns_30(self, db):
        """3 activities today → 3 × 10 − (2.0 × 0) = 30."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            for _ in range(3):
                cur.execute(
                    f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                       VALUES (%s, %s, 'email', 'opened')""",
                    (str(uuid.uuid4()), lead_id),
                )
            cur.execute("SELECT fn_calculate_lead_velocity(%s)", (lead_id,))
            assert cur.fetchone()[0] == 30.0

    def test_old_activity_floors_at_zero(self, db):
        """1 activity 20+ days ago → max(0, 10 − 40) = 0."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            self._setup_activity(db, lead_id, days_ago=25)
            cur.execute("SELECT fn_calculate_lead_velocity(%s)", (lead_id,))
            assert cur.fetchone()[0] == 0.0

    def test_many_activities_old_but_high_volume(self, db):
        """10 activities from 30 days ago: max(0, 100 − 60) = 40."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            for _ in range(10):
                cur.execute(
                    f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                       VALUES (%s, %s, 'call', 'connected')""",
                    (str(uuid.uuid4()), lead_id),
                )
            cur.execute(
                "UPDATE lead_activities SET created_at = NOW() - '30 days'::interval WHERE lead_id = %s",
                (lead_id,),
            )
            cur.execute("SELECT fn_calculate_lead_velocity(%s)", (lead_id,))
            assert cur.fetchone()[0] == 40.0

    def test_partial_decay(self, db):
        """5 activities, 2 days ago: 5×10 − 2.0×2 = 46."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            for _ in range(5):
                cur.execute(
                    f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                       VALUES (%s, %s, 'email', 'clicked')""",
                    (str(uuid.uuid4()), lead_id),
                )
            cur.execute(
                "UPDATE lead_activities SET created_at = NOW() - '2 days'::interval WHERE lead_id = %s",
                (lead_id,),
            )
            cur.execute("SELECT fn_calculate_lead_velocity(%s)", (lead_id,))
            assert cur.fetchone()[0] == 46.0
