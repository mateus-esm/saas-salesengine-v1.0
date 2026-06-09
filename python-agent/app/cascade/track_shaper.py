"""JTBD 1 — Track Shaper: NL description → validated PipelineBlueprint via Agno."""

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from pydantic import ValidationError

from app.schemas import PipelineBlueprint

_SYSTEM_PT = """\
Você é um arquiteto de pipelines de CRM especializado em vendas B2C e B2B no Brasil.
Sua única responsabilidade é converter a descrição de processo de vendas do usuário
em um blueprint estruturado de pipeline de CRM.

REGRAS OBRIGATÓRIAS — nunca as viole:
1. Gere EXATAMENTE as etapas (stages) que o processo descreve, com no mínimo 3 etapas.
2. O campo `position` das etapas deve ser contínuo a partir de 0 (0, 1, 2, ...).
3. A última etapa bem-sucedida deve ter `stage_type: "won"`.
   Se o processo menciona rejeição ou perda, adicione uma etapa `stage_type: "lost"`.
   Todas as outras etapas têm `stage_type: "open"`.
4. Extraia pelo menos 2 campos customizados (custom_fields) dos dados mencionados no
   processo (ex: número de quartos, valor, metragem, CNPJ, capacidade, etc.).
5. O `key` de cada campo customizado DEVE ser snake_case: apenas letras minúsculas,
   números e underscore, começando com letra (ex: `numero_quartos`, `valor_contrato`).
6. O `position` dos campos customizados deve ser contínuo a partir de 0.
7. Quando o processo mencionar prazo (ex: "24 horas", "2 dias"), defina `max_idle_hours`
   na etapa correspondente com o valor em horas.
8. Quando houver cadência/follow-up mencionada, defina `cadence_value` e `cadence_unit`
   (`"hours"` ou `"days"`) em par — nunca apenas um deles.
9. Use `"number"` para quantidades inteiras, `"currency"` para valores monetários,
   `"date"` para datas, `"boolean"` para sim/não, `"text"` para texto livre,
   `"phone"` para telefone, `"select"` quando houver opções predefinidas.
10. Para campos `select` ou `multi_select`, preencha `options` com as opções possíveis.
11. Responda APENAS com o JSON do blueprint — sem texto adicional, sem markdown.
12. O JSON deve ser diretamente deserializável no schema PipelineBlueprint.

SCHEMA DE SAÍDA:
{
  "pipeline_name": "string",
  "description": "string | null",
  "stages": [
    {
      "name": "string",
      "position": 0,
      "stage_type": "open" | "won" | "lost",
      "color": "#hex",
      "max_idle_hours": int | null,
      "cadence_value": int | null,
      "cadence_unit": "hours" | "days" | null
    }
  ],
  "custom_fields": [
    {
      "key": "snake_case_key",
      "label": "Rótulo legível",
      "type": "text|number|currency|date|boolean|select|multi_select|url|phone|address",
      "required": false,
      "options": null,
      "position": 0,
      "description": null
    }
  ]
}
"""


async def shape_track(
    *,
    prompt: str,
    locale: str = "pt-BR",
    model_id: str,
) -> PipelineBlueprint:
    """Convert a natural-language sales process description into a PipelineBlueprint.

    Raises:
        ValidationError: if the LLM output fails Pydantic validation (caller maps to 422).
    """
    agent = Agent(
        model=OpenAIChat(id=model_id),
        output_schema=PipelineBlueprint,
        system_message=_SYSTEM_PT,
        telemetry=False,
        # JSON mode (parse-based) instead of OpenAI strict structured outputs,
        # which rejects optional fields / open dicts in our blueprint schema.
        use_json_mode=True,
    )
    response = await agent.arun(prompt)
    # Agno with output_schema already validates; if the model returns garbage
    # that bypasses Agno's parse, validate explicitly so the caller always gets
    # a typed error rather than an arbitrary AttributeError.
    if isinstance(response.content, PipelineBlueprint):
        return response.content
    return PipelineBlueprint.model_validate(response.content)
