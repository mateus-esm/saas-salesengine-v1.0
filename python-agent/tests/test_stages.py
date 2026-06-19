import sys
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.cascade import stages


class _Q:
    def __init__(self, c, t): self.c, self.t = c, t
    def select(self, *_): return self
    def eq(self, *_): return self
    def order(self, *a, **k): return self
    def execute(self):
        d = self.c.sel.get(self.t, [])
        return SimpleNamespace(data=(d.pop(0) if d else []), error=None)
class _C:
    def __init__(self, sel): self.sel = sel
    def table(self, t): return _Q(self, t)


def test_load_stage_guide_orders_and_filters_deleted():
    client = _C({"pipeline_stages_v2": [[
        {"name": "Lead", "stage_type": "open", "description": "Novo lead.", "max_idle_hours": 48, "position": 0, "deleted_at": None},
        {"name": "Morto", "stage_type": "open", "description": None, "max_idle_hours": None, "position": 1, "deleted_at": "2026-01-01"},
    ]]})
    guide = stages.load_stage_guide(client, "t", "p")
    assert [g["name"] for g in guide] == ["Lead"]      # deleted filtered
    assert guide[0]["description"] == "Novo lead."
