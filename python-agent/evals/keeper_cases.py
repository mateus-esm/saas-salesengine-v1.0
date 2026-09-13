"""Sprint 11 · Onda 6 · T66 — conversations in the style of the real ones.

Synthetic: no customer's name, phone or message. Each case is a context in the
shape of crm_copilot_context, what the keeper should propose, and what it must
not (e.g. no won/lost without an explicit close).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from evals.scoring import Expect

STAGES = [
    {"id": "st-novo", "name": "Novo", "stage_type": "open", "position": 0, "current": True,
     "description": "Contato chegou."},
    {"id": "st-qualif", "name": "Qualificado", "stage_type": "open", "funnel_event": "qualified", "position": 1,
     "description": "Sabemos o consumo e o tipo de telhado."},
    {"id": "st-prop", "name": "Proposta enviada", "stage_type": "open", "funnel_event": "proposal_sent", "position": 2,
     "description": "A proposta foi enviada ao cliente."},
    {"id": "st-ganho", "name": "Ganho", "stage_type": "won", "position": 3},
    {"id": "st-perdido", "name": "Perdido", "stage_type": "lost", "position": 4},
]

FIELDS = [
    {"field_id": "f-consumo", "key": "consumo_kwh", "label": "Consumo mensal (kWh)", "type": "number", "value": None},
    {"field_id": "f-telhado", "key": "telhado", "label": "Tipo de telhado", "type": "select",
     "options": ["cerâmica", "metálico", "laje"], "value": None},
    {"field_id": "f-cidade", "key": "cidade", "label": "Cidade", "type": "text", "value": None},
]


def _ctx(messages: list[tuple[str, str]], *, name: str = "[Novo Contato - WhatsApp]", summary: str | None = None) -> dict:
    return {
        "opportunity": {"id": "opp", "value": 0, "status": "open"},
        "lead": {"name": name, "name_is_placeholder": name.startswith("["), "email": None, "tags": []},
        "pipeline": {"name": "Usinas Solares", "offer_mode": "free"},
        "stages": STAGES,
        "fields": FIELDS,
        "team_tags": ["residencial", "comercial"],
        "open_tasks": [],
        "messages": [{"at": f"2026-09-14T1{i}:00:00+00:00", "from": who, "text": text} for i, (who, text) in enumerate(messages)],
        "last_message_at": "2026-09-14T19:00:00+00:00",
        "memory": {"summary": summary},
        "settings": {"mode": "autonomous", "threshold": 0.75,
                     "extraction_hints": "Consumo em kWh vem da conta de luz; telhado: cerâmica, metálico ou laje."},
    }


@dataclass
class KeeperCase:
    name: str
    ctx: dict
    expected: list[Expect]
    forbidden: list[str] = field(default_factory=list)


KEEPER_CASES = [
    KeeperCase(
        "extrai consumo, telhado e cidade",
        _ctx([
            ("customer", "Oi, vi o anúncio de vocês. Quero um orçamento de energia solar."),
            ("agent", "Claro! Qual o seu consumo mensal e o tipo de telhado?"),
            ("customer", "Minha conta vem uns 450 kWh por mês. O telhado é de telha cerâmica, moro em Fortaleza."),
        ]),
        expected=[
            Expect("set_field", {"field_id": "f-consumo", "value": 450}),
            Expect("set_field", {"field_id": "f-telhado", "value": "cerâmica"}),
            Expect("set_field", {"field_id": "f-cidade", "value": "Fortaleza"}),
        ],
        forbidden=["set_outcome", "set_value"],
    ),
    KeeperCase(
        "qualificado quando o consumo e o telhado chegam",
        _ctx([
            ("customer", "Consumo 800 kWh, telhado metálico. Pode fazer a proposta?"),
        ], summary="Pediu orçamento pelo anúncio."),
        expected=[
            Expect("move_stage", {"stage_id": "st-qualif"}),
            Expect("create_task", check=lambda a: "propost" in str(a.get("title", "")).lower()),
        ],
        forbidden=["set_outcome"],
    ),
    KeeperCase(
        "fechamento explícito",
        _ctx([
            ("customer", "Recebi a proposta. Fechado! Pode mandar o contrato que eu assino hoje."),
        ], summary="Proposta de 5 kWp enviada; cliente negociou prazo."),
        expected=[
            Expect("set_outcome", {"outcome": "won"}, any_of=[Expect("move_stage", {"stage_id": "st-ganho"})]),
        ],
    ),
    KeeperCase(
        "desistência",
        _ctx([
            ("customer", "Obrigado, mas decidimos não fazer agora. Não tenho mais interesse."),
        ], summary="Proposta enviada há 10 dias."),
        expected=[
            Expect("set_outcome", {"outcome": "lost"}, any_of=[Expect("move_stage", {"stage_id": "st-perdido"})]),
        ],
        forbidden=["create_task"],
    ),
    KeeperCase(
        "o contato diz o nome e o e-mail",
        _ctx([
            ("customer", "Sou a Carla, meu e-mail é carla.teste@exemplo.com. Me manda as informações por lá."),
        ]),
        expected=[
            Expect("set_contact", {"attribute": "name"}, check=lambda a: "carla" in str(a.get("value", "")).lower()),
            Expect("set_contact", {"attribute": "email", "value": "carla.teste@exemplo.com"}),
        ],
        forbidden=["set_outcome", "move_stage"],
    ),
    KeeperCase(
        "conversa sem novidade",
        _ctx([
            ("customer", "Ok, obrigado!"),
        ], summary="Aguardando a visita técnica agendada para sexta."),
        expected=[],
        forbidden=["set_field", "move_stage", "set_outcome", "set_value", "set_contact"],
    ),
]
