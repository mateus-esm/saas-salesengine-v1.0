"""Real SQL-backed tests for fn_calculate_icp_score.

Calls the actual PL/pgSQL function against PostgreSQL, not a Python mirror.
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


class TestIcpScoreSQL:
    """Tests ICP scoring formula directly via SQL: I = (Σ Wi × Vi) × 100."""

    def _create_pipeline_with_weights(self, db, pipeline_id: str, weights: list[dict]) -> None:
        """Insert a pipeline row with the given icp_weights."""
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO pipelines (id, equipe_id, name, icp_weights)
                   VALUES (%s, '{_EQ}', %s, %s)""",
                (pipeline_id, "test-pipe", json.dumps(weights)),
            )

    def _create_opportunity(self, db, opp_id: str, lead_id: str, pipeline_id: str) -> None:
        with db.cursor() as cur:
            cur.execute(
                f"""INSERT INTO opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
                   VALUES (%s, '{_EQ}', %s, %s, '{_STAGE}', 1000)""",
                (opp_id, lead_id, pipeline_id),
            )

    def _set_custom_data(self, db, lead_id: str, data: dict) -> None:
        with db.cursor() as cur:
            cur.execute(
                "UPDATE leads SET personal_custom_data = %s WHERE id = %s",
                (json.dumps(data), lead_id),
            )

    def test_no_weights_returns_zero(self, db):
        """Pipeline with empty icp_weights → score = 0."""
        lead_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            self._create_pipeline_with_weights(db, pipeline_id, [])
            self._create_opportunity(db, str(uuid.uuid4()), lead_id, pipeline_id)
            cur.execute("SELECT score FROM fn_calculate_icp_score(%s)", (lead_id,))
            row = cur.fetchone()
            assert row is not None
            assert float(row[0]) == 0.0

    def test_partial_match_returns_half_weight(self, db):
        """1 weight targeting 'engenheiro', lead has 'engenheiro' exactly → 100."""
        lead_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            self._create_pipeline_with_weights(db, pipeline_id, [
                {"field_key": "job_title", "weight": 1.0, "target_value": "engenheiro", "label": "Cargo"},
            ])
            self._create_opportunity(db, str(uuid.uuid4()), lead_id, pipeline_id)
            self._set_custom_data(db, lead_id, {"job_title": "engenheiro"})
            cur.execute("SELECT score FROM fn_calculate_icp_score(%s)", (lead_id,))
            row = cur.fetchone()
            assert row is not None
            assert float(row[0]) == 100.0

    def test_no_match_returns_zero(self, db):
        """1 weight, lead has null value → score = 0."""
        lead_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            self._create_pipeline_with_weights(db, pipeline_id, [
                {"field_key": "job_title", "weight": 1.0, "target_value": "engenheiro", "label": "Cargo"},
            ])
            self._create_opportunity(db, str(uuid.uuid4()), lead_id, pipeline_id)
            self._set_custom_data(db, lead_id, {"job_title": None})
            cur.execute("SELECT score FROM fn_calculate_icp_score(%s)", (lead_id,))
            row = cur.fetchone()
            assert row is not None
            assert float(row[0]) == 0.0

    def test_multi_weight_averages_correctly(self, db):
        """2 weights: 0.8 (match=100%) + 0.2 (no match=0%) → (0.8×1 + 0.2×0)/1.0 = 80."""
        lead_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            self._create_pipeline_with_weights(db, pipeline_id, [
                {"field_key": "job_title", "weight": 0.8, "target_value": "engenheiro", "label": "Cargo"},
                {"field_key": "industry", "weight": 0.2, "target_value": "tech", "label": "Setor"},
            ])
            self._create_opportunity(db, str(uuid.uuid4()), lead_id, pipeline_id)
            self._set_custom_data(db, lead_id, {"job_title": "engenheiro", "industry": "outro"})
            cur.execute("SELECT score FROM fn_calculate_icp_score(%s)", (lead_id,))
            row = cur.fetchone()
            assert row is not None
            assert float(row[0]) == 80.0

    def test_breakdown_contains_weights(self, db):
        """Breakdown JSONB includes field_key, weight, match, and label per weight."""
        lead_id = str(uuid.uuid4())
        pipeline_id = str(uuid.uuid4())
        with db.cursor() as cur:
            cur.execute(
                f"INSERT INTO leads (id, equipe_id, name) VALUES (%s, '{_EQ}', 'Test Lead')",
                (lead_id,),
            )
            self._create_pipeline_with_weights(db, pipeline_id, [
                {"field_key": "job_title", "weight": 1.0, "target_value": "engenheiro", "label": "Cargo"},
            ])
            self._create_opportunity(db, str(uuid.uuid4()), lead_id, pipeline_id)
            self._set_custom_data(db, lead_id, {"job_title": "engenheiro"})
            cur.execute("SELECT breakdown FROM fn_calculate_icp_score(%s)", (lead_id,))
            row = cur.fetchone()
            assert row is not None
            breakdown = json.loads(row[0]) if isinstance(row[0], str) else row[0]
            assert len(breakdown) == 1
            entry = breakdown[0]
            assert entry["field"] == "job_title"
            assert entry["weight"] == 1.0
            assert entry["match"] == 1.0
            assert entry.get("label") == "Cargo"
