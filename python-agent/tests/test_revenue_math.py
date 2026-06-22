"""Tests for Predictable Revenue lead-velocity formula (§4.2).

S = (Sigma Aj) - (Dk * t)  where:
    Aj = activity points per event (each = +10)
    t  = days since last activity
    Dk = decay factor (constant 2.0)

These tests validate the **pure math** (no DB dependency).
"""

import pytest


# ── formula helper (replicates PL/pgSQL fn_calculate_lead_velocity) ──────────

DECAY_FACTOR = 2.0


def _calc_velocity(
    activity_points: list[int],
    days_since_last: int,
    decay: float = DECAY_FACTOR,
) -> float:
    """Calculate lead velocity: sum(activity_points) - (decay * days_since_last).
    Never returns below 0.0 (floor guard).
    """
    return max(0.0, sum(activity_points) - (decay * days_since_last))


# ── tests ────────────────────────────────────────────────────────────────────


class TestLeadVelocity:
    """Sprint 6.7 — Predictable Revenue lead-velocity scoring."""

    TOLERANCE = 1e-9

    def test_velocity_decays_with_silence(self):
        """Given 2 activities (20 pts), 5 days silence: velocity = 20 - (2*5) = 10."""
        points = [10, 10]  # two activities
        days_since = 5
        expected = 10.0

        result = _calc_velocity(points, days_since)

        assert abs(result - expected) < self.TOLERANCE, (
            f"Expected {expected}, got {result}"
        )

    def test_velocity_zero_for_no_activity(self):
        """Given 0 activities: velocity = 0.0 (guard: never negative)."""
        points = []
        days_since = 0  # no activity means no decay dimension either

        result = _calc_velocity(points, days_since)

        assert abs(result - 0.0) < self.TOLERANCE, (
            f"Expected 0.0, got {result}"
        )

    def test_velocity_floor_at_zero(self):
        """Given 1 activity (10 pts), 100 days silence: raw = 10-200 = -190.0 -> 0.0."""
        points = [10]
        days_since = 100
        expected = 0.0

        result = _calc_velocity(points, days_since)

        assert abs(result - expected) < self.TOLERANCE, (
            f"Expected {expected}, got {result}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
