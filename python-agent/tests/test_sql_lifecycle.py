"""Real SQL-backed tests for fn_advance_lifecycle trigger + sweep recompute.

Inserts real leads and exercises the BEFORE INSERT / UPDATE trigger against
PostgreSQL. Also validates the sweep-recompute pattern: updating a lead's
timestamp re-evaluates lifecycle with fresh velocity data.

Skipped when DATABASE_URL is not set.
"""

from __future__ import annotations

import json
import uuid

import pytest

from conftest import TEST_EQUIPE_ID, TEST_STAGE_ID


pytestmark = pytest.mark.db
_EQ = TEST_EQUIPE_ID       # valid equipe UUID from production tenant
_STAGE = TEST_STAGE_ID      # valid pipeline_stages_v2 UUID from production tenant


class TestLifecycleTriggerSQL:
    """Validate lifecycle trigger rules with real SQL execution."""

    # ── raw → mql ──────────────────────────────────────────────────────────

    def test_raw_with_email_and_enrichment_advances_to_mql(self, db):
        """raw lead with email + personal_custom_data → mql on INSERT."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, email, personal_custom_data, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'test@example.com', %s, 'raw')
                   RETURNING lifecycle_stage""",
                (lead_id, json.dumps({"job_title": "engenheiro"})),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "mql", f"Expected mql, got {row[0]}"

    def test_raw_without_email_stays_raw(self, db):
        """raw lead without email → stays raw."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, email, personal_custom_data, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', NULL, %s, 'raw')
                   RETURNING lifecycle_stage""",
                (lead_id, json.dumps({"job_title": "engenheiro"})),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "raw"

    def test_raw_without_enrichment_stays_raw(self, db):
        """raw lead with email but empty enrichment → stays raw."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, email, personal_custom_data, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'test@example.com', '{{}}'::jsonb, 'raw')
                   RETURNING lifecycle_stage""",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "raw"

    # ── mql → sql ──────────────────────────────────────────────────────────

    def test_mql_with_opportunity_and_velocity_advances_to_sql(self, db):
        """mql lead with opportunity + velocity >= 10 → sql."""
        lead_id = str(uuid.uuid4())
        opp_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            # Create lead at mql
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'mql')""",
                (lead_id,),
            )
            # Create pipeline + opportunity
            cur.execute(
                f"""INSERT INTO pipelines (id, equipe_id, name) VALUES (%s, '{_EQ}', 'test')""",
                (pipeline_id,),
            )
            cur.execute(
                f"""INSERT INTO opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
                   VALUES (%s, '{_EQ}', %s, %s, '{_STAGE}', 1000)""",
                (opp_id, lead_id, pipeline_id),
            )
            # Create activity (velocity = 10)
            cur.execute(
                f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                   VALUES (%s, %s, 'email', 'opened')""",
                (str(uuid.uuid4()), lead_id),
            )
            # Trigger lifecycle re-evaluation by touching a watched column.
            # trg_advance_lifecycle fires on UPDATE OF lifecycle_stage, so we
            # self-assign to force re-evaluation without changing the value.
            cur.execute(
                """UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = %s
                   RETURNING lifecycle_stage""",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "sql", f"Expected sql, got {row[0]}"

    def test_mql_without_opportunity_stays_mql(self, db):
        """mql lead with velocity >= 10 but NO opportunity → stays mql."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'mql')""",
                (lead_id,),
            )
            # Activity to give it velocity
            cur.execute(
                f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                   VALUES (%s, %s, 'email', 'opened')""",
                (str(uuid.uuid4()), lead_id),
            )
            cur.execute(
                """UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = %s
                   RETURNING lifecycle_stage""",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "mql"

    def test_mql_low_velocity_stays_mql(self, db):
        """mql lead with opportunity but low velocity → stays mql."""
        lead_id = str(uuid.uuid4())
        opp_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'mql')""",
                (lead_id,),
            )
            cur.execute(
                f"""INSERT INTO pipelines (id, equipe_id, name) VALUES (%s, '{_EQ}', 'test')""",
                (pipeline_id,),
            )
            cur.execute(
                f"""INSERT INTO opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
                   VALUES (%s, '{_EQ}', %s, %s, '{_STAGE}', 1000)""",
                (opp_id, lead_id, pipeline_id),
            )
            # No activities → velocity = 0 → < 10
            cur.execute(
                """UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = %s
                   RETURNING lifecycle_stage""",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "mql"

    def test_sql_never_downgrades(self, db):
        """sql lead is never auto-downgraded even if enrichment is removed."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'sql')""",
                (lead_id,),
            )
            # Trigger with empty enrichment (would downgrade if allowed)
            cur.execute(
                """UPDATE leads SET personal_custom_data = '{}'::jsonb WHERE id = %s
                   RETURNING lifecycle_stage""",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "sql", "SQL stage must never be auto-downgraded"


class TestSweepRecomputeSQL:
    """Validates the sweep-recompute pattern: updating mql leads with velocity
    triggers advancement — the same logic the sweep endpoint relies on."""

    def test_sweep_nudge_pushes_mql_to_sql(self, db):
        """Sweep-style nudge: update mql lead with velocity >= 10 + opportunity → sql."""
        lead_id = str(uuid.uuid4())
        opp_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage, email)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'mql', 'sweep@test.com')""",
                (lead_id,),
            )
            cur.execute(
                f"""INSERT INTO pipelines (id, equipe_id, name) VALUES (%s, '{_EQ}', 'test')""",
                (pipeline_id,),
            )
            cur.execute(
                f"""INSERT INTO opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
                   VALUES (%s, '{_EQ}', %s, %s, '{_STAGE}', 1000)""",
                (opp_id, lead_id, pipeline_id),
            )
            # Activities → velocity >= 10
            for _ in range(3):
                cur.execute(
                    f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                       VALUES (%s, %s, 'email', 'opened')""",
                    (str(uuid.uuid4()), lead_id),
                )
            # Sweep nudge: touch the lead row to trigger lifecycle re-evaluation
            cur.execute(
                """UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = %s
                   RETURNING lifecycle_stage""",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "sql", f"Sweep: expected sql, got {row[0]}"

    def test_sweep_skips_mql_without_opportunity(self, db):
        """Sweep nudge on mql lead without opportunity → stays mql."""
        lead_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage, email)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'mql', 'sweep@test.com')""",
                (lead_id,),
            )
            for _ in range(3):
                cur.execute(
                    f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                       VALUES (%s, %s, 'email', 'opened')""",
                    (str(uuid.uuid4()), lead_id),
                )
            cur.execute(
                "UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = %s RETURNING lifecycle_stage",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "mql"

    def test_sweep_skips_stale_mql_low_velocity(self, db):
        """Sweep nudge on mql with stale activities (low velocity) → stays mql."""
        lead_id = str(uuid.uuid4())
        opp_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO leads (id, equipe_id, name, lifecycle_stage, email)
                   VALUES (%s, '{_EQ}', 'Test Lead', 'mql', 'sweep@test.com')""",
                (lead_id,),
            )
            cur.execute(
                f"""INSERT INTO pipelines (id, equipe_id, name) VALUES (%s, '{_EQ}', 'test')""",
                (pipeline_id,),
            )
            cur.execute(
                f"""INSERT INTO opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
                   VALUES (%s, '{_EQ}', %s, %s, '{_STAGE}', 1000)""",
                (opp_id, lead_id, pipeline_id),
            )
            # 1 activity from 30 days ago → velocity = max(0, 10-60) = 0
            cur.execute(
                f"""INSERT INTO lead_activities (id, lead_id, tipo, descricao)
                   VALUES (%s, %s, 'email', 'old')""",
                (str(uuid.uuid4()), lead_id),
            )
            cur.execute(
                "UPDATE lead_activities SET created_at = NOW() - '30 days'::interval WHERE lead_id = %s",
                (lead_id,),
            )
            cur.execute(
                "UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = %s RETURNING lifecycle_stage",
                (lead_id,),
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "mql"
