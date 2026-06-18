import sys
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.cascade import agents_config


class _Q:
    def __init__(self, c, t): self.c, self.t = c, t
    def select(self, *_): return self
    def eq(self, *_): return self
    def execute(self):
        d = self.c.sel.get(self.t, [])
        return SimpleNamespace(data=(d.pop(0) if d else []), error=None)

class _C:
    def __init__(self, sel): self.sel = sel
    def table(self, t): return _Q(self, t)


def test_load_agent_config_returns_row_values():
    """When a copilot_agents row exists, loader returns its name/system_prompt/autonomy_mode."""
    client = _C({"copilot_agents": [[
        {
            "name": "Vendedor IA",
            "system_prompt": "Você é um assistente de vendas.",
            "autonomy_mode": "autonomous",
        }
    ]]})
    cfg = agents_config.load_agent_config(client, "equipe-1", "chat")
    assert cfg["name"] == "Vendedor IA"
    assert cfg["system_prompt"] == "Você é um assistente de vendas."
    assert cfg["autonomy_mode"] == "autonomous"


def test_load_agent_config_empty_returns_defaults():
    """When no row exists, loader returns sensible defaults."""
    client = _C({"copilot_agents": [[]]})  # empty list
    cfg = agents_config.load_agent_config(client, "equipe-1", "pipeline", pipeline_id="pipe-1")
    assert cfg["autonomy_mode"] == "observe"
    assert cfg["system_prompt"] is None
    assert "name" in cfg


def test_load_agent_config_exception_returns_defaults():
    """On any exception (e.g. network error), loader returns defaults without raising."""
    class _BrokenQ:
        def select(self, *_): return self
        def eq(self, *_): return self
        def execute(self): raise RuntimeError("DB down")
    class _BrokenC:
        def table(self, _): return _BrokenQ()

    cfg = agents_config.load_agent_config(_BrokenC(), "equipe-1", "contact_base")
    assert cfg["autonomy_mode"] == "observe"
    assert cfg["system_prompt"] is None
