"""Sprint 11 · T9 — the date bug that stamped every Solo Energia lead with the
import day.

merge() normalizes `Data` to ISO ('2025-03-14T10:22:00'); the SQL writer then
ran parse_dt on it AGAIN, and parse_dt did not accept the 'T'. It returned None,
the writer fell back to now(), and 1,253 leads were "created" on 10/09/2026.

Run:  python scripts/test_migrate_solo_energia.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from migrate_solo_energia import merge, parse_dt  # noqa: E402


def test_parse_dt_accepts_its_own_output():
    # The bug in one line: parse_dt must be idempotent.
    once = parse_dt("2025-03-14 10:22:00")
    assert once == "2025-03-14T10:22:00", once
    assert parse_dt(once) == once, parse_dt(once)


def test_parse_dt_keeps_the_three_export_formats():
    assert parse_dt("2025/01/31") == "2025-01-31T00:00:00"
    assert parse_dt("31/01/2025") == "2025-01-31T00:00:00"
    assert parse_dt("2025/05/20 14:00:00") == "2025-05-20T14:00:00"
    assert parse_dt("") is None
    assert parse_dt("'-") is None


def test_merged_contact_date_survives_the_second_parse():
    merged = merge([
        {"Nome": "Ana", "Telefone": "85999990000", "Data": "2025-03-14 10:22:00"},
        {"Nome": "Ana", "Telefone": "85999990000", "Data": "2025-01-02 09:00:00"},
    ])
    # merge keeps the oldest date, already in ISO…
    assert merged["Data"] == "2025-01-02T09:00:00", merged["Data"]
    # …and the SQL writer's parse_dt must still read it.
    assert parse_dt(merged["Data"]) == "2025-01-02T09:00:00"


if __name__ == "__main__":
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok    {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL  {name}: {e}")
    sys.exit(1 if failures else 0)
