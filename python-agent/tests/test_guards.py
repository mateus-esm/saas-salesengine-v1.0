import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.guards import assert_table, assert_equipe, GuardError


def test_assert_table_allowed():
    # Should not raise any exception
    assert_table("opportunities")
    assert_table("leads")
    assert_table("tasks")


def test_assert_table_denied():
    with pytest.raises(GuardError) as exc_info:
        assert_table("invalid_table_name")
    assert "not in the whitelist" in str(exc_info.value)


def test_assert_equipe_success():
    row = {"id": "1", "equipe_id": "test-equipe-123"}
    # Should not raise any exception
    assert_equipe(row, "test-equipe-123")


def test_assert_equipe_uuid_str_comparison():
    row = {"id": "1", "equipe_id": "8fed0c7e-b96a-49a6-bf25-f45066d18210"}
    # Should handle string and uuid comparisons smoothly
    assert_equipe(row, "8fed0c7e-b96a-49a6-bf25-f45066d18210")


def test_assert_equipe_mismatch():
    row = {"id": "1", "equipe_id": "other-equipe"}
    with pytest.raises(GuardError) as exc_info:
        assert_equipe(row, "my-equipe")
    assert "Tenant violation" in str(exc_info.value)


def test_assert_equipe_missing_equipe_id():
    row = {"id": "1"}
    with pytest.raises(GuardError) as exc_info:
        assert_equipe(row, "my-equipe")
    assert "does not contain an 'equipe_id'" in str(exc_info.value)


def test_assert_equipe_none_row():
    with pytest.raises(GuardError) as exc_info:
        assert_equipe(None, "my-equipe")
    assert "row is empty or None" in str(exc_info.value)
