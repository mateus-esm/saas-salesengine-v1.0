from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib import request

from app.guards import assert_equipe, assert_table
from app.schemas import ActionResult
from app.skills.registry import register


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _interpolate(template: str, *, lead_id: str | None = None, opportunity_id: str | None = None) -> str:
    return (
        template.replace("{{lead_id}}", lead_id or "")
        .replace("{{opportunity_id}}", opportunity_id or "")
        .replace("{{contact.name}}", "")
    )


async def _post_webhook(url: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    await asyncio.to_thread(request.urlopen, req, timeout=5)


@register
class CoreTableSkill:
    name = "core_table"

    # High-stakes verbs that must pause for human approval when a plan marks them so:
    # closing a deal (won/lost) and firing an external side effect (webhook).
    _CONFIRM_VERBS = frozenset({"set_status", "trigger_webhook"})

    def __init__(self, client: Any, equipe_id: str, actor: str) -> None:
        self.client = client
        self.equipe_id = str(equipe_id)
        self.actor = actor

    @classmethod
    def confirmation_required_verbs(cls) -> frozenset[str]:
        """Verbs that must pause for human approval when the plan marks them so."""
        return cls._CONFIRM_VERBS

    async def move_stage(
        self,
        opportunity_id: str,
        stage_type: str = "open",
        stage_name_hint: str | None = None,
    ) -> ActionResult:
        try:
            opportunity = self._fetch_one(
                "opportunities",
                {"id": opportunity_id},
                "id,equipe_id,pipeline_id,stage_id",
            )
            if opportunity is None:
                return ActionResult(success=False, error="opportunity_not_found")

            stage = self._resolve_stage(
                pipeline_id=opportunity["pipeline_id"],
                stage_type=stage_type,
                stage_name_hint=stage_name_hint,
            )
            if stage is None:
                return ActionResult(success=False, error="stage_not_found")

            self._update(
                "opportunities",
                {
                    "stage_id": stage["id"],
                    "stage_entered_at": _now_iso(),
                },
                {"id": opportunity_id},
            )
            stamped = self._stamp_latest_stage_history(opportunity_id, stage["id"])

            return ActionResult(
                success=True,
                detail={"action": "move_stage", "stage_id": stage["id"], "stage": stage["name"], "history_stamped": stamped},
            )
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "move_stage"})

    async def set_status(self, opportunity_id: str, status: str) -> ActionResult:
        try:
            opportunity = self._fetch_one("opportunities", {"id": opportunity_id}, "id,equipe_id")
            if opportunity is None:
                return ActionResult(success=False, error="opportunity_not_found")

            patch: dict[str, Any] = {"status": status}
            if status in {"won", "lost"}:
                patch["closed_at"] = _now_iso()

            self._update("opportunities", patch, {"id": opportunity_id})
            return ActionResult(success=True, detail={"action": "set_status", "status": status})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "set_status"})

    async def set_field(self, opportunity_id: str, field_id: str, value: Any) -> ActionResult:
        try:
            opportunity = self._fetch_one("opportunities", {"id": opportunity_id}, "id,equipe_id,custom_data")
            if opportunity is None:
                return ActionResult(success=False, error="opportunity_not_found")

            custom_data = dict(opportunity.get("custom_data") or {})
            custom_data[field_id] = value
            self._update("opportunities", {"custom_data": custom_data}, {"id": opportunity_id})
            return ActionResult(success=True, detail={"action": "set_field", "field_id": field_id})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "set_field"})

    async def attach_file(
        self, opportunity_id: str, field_id: str, file_url: str, file_name: str | None = None
    ) -> ActionResult:
        try:
            opportunity = self._fetch_one("opportunities", {"id": opportunity_id}, "id,equipe_id,custom_data")
            if opportunity is None:
                return ActionResult(success=False, error="opportunity_not_found")

            custom_data = dict(opportunity.get("custom_data") or {})
            custom_data[field_id] = {"url": file_url, "name": file_name}
            self._update("opportunities", {"custom_data": custom_data}, {"id": opportunity_id})
            return ActionResult(success=True, detail={"action": "attach_file", "field_id": field_id})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "attach_file"})

    async def set_contact_field(self, lead_id: str, key: str, value: Any) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id,personal_custom_data")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            personal_custom_data = dict(lead.get("personal_custom_data") or {})
            personal_custom_data[key] = value
            self._update("leads", {"personal_custom_data": personal_custom_data}, {"id": lead_id})
            return ActionResult(success=True, detail={"action": "set_contact_field", "key": key})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "set_contact_field"})

    async def add_touchpoint(self, lead_id: str, touchpoint_type: str, content: str) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            payload = {
                "lead_id": lead_id,
                "touchpoint_type": touchpoint_type or "note",
                "content": _interpolate(content, lead_id=lead_id),
            }
            self._insert("touchpoints", payload)
            return ActionResult(success=True, detail={"action": "add_touchpoint"})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "add_touchpoint"})

    async def add_note(self, lead_id: str, content: str, opportunity_id: str | None = None) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            incoming_descricao = _interpolate(content, lead_id=lead_id)
            normalized_incoming = incoming_descricao.strip().lower()

            # De-dupe against this lead's existing notes. lead_activities has NO
            # equipe_id column (it is scoped via lead_id, and the lead above was
            # already tenant-verified), so query directly rather than via
            # _fetch_many (which would add a non-existent equipe_id filter).
            existing_resp = (
                self.client.table("lead_activities")
                .select("id,descricao")
                .eq("lead_id", lead_id)
                .eq("tipo", "note")
                .execute()
            )
            existing = getattr(existing_resp, "data", None) or []
            for note in existing:
                if (note.get("descricao") or "").strip().lower() == normalized_incoming:
                    return ActionResult(success=True, detail={"action": "add_note", "deduped": True})

            payload = {
                "lead_id": lead_id,
                "tipo": "note",
                "descricao": incoming_descricao,
                "metadata": {"actor": self.actor},
            }
            if opportunity_id:
                payload["opportunity_id"] = opportunity_id
            self._insert("lead_activities", payload)
            return ActionResult(success=True, detail={"action": "add_note"})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "add_note"})

    async def create_task(self, lead_id: str, title: str, due_in_hours: int | None = None) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            due_date = None
            if due_in_hours is not None:
                due_date = (datetime.now(UTC) + timedelta(hours=due_in_hours)).isoformat()

            payload = {
                "lead_id": lead_id,
                "title": _interpolate(title, lead_id=lead_id),
                "due_date": due_date,
                "status": "pending",
            }
            self._insert("tasks", payload)
            return ActionResult(success=True, detail={"action": "create_task"})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "create_task"})

    async def add_tag(self, lead_id: str, tag: str) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id,tags")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            tags = list(lead.get("tags") or [])
            if tag not in tags:
                tags.append(tag)
                self._update("leads", {"tags": tags}, {"id": lead_id})

            return ActionResult(success=True, detail={"action": "add_tag", "tag": tag, "deduped": tag in lead.get("tags", [])})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "add_tag"})

    async def trigger_webhook(self, url: str, payload: dict[str, Any]) -> ActionResult:
        try:
            await _post_webhook(
                url,
                {
                    "event": "core_table_triggered",
                    "equipe_id": self.equipe_id,
                    "actor": self.actor,
                    **(payload or {}),
                },
            )
            return ActionResult(success=True, detail={"action": "trigger_webhook", "url": url})
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "trigger_webhook"})

    async def create_opportunity(self, lead_id: str, pipeline_id: str, stage_id: str | None = None) -> ActionResult:
        try:
            lead = self._fetch_one("leads", {"id": lead_id}, "id,equipe_id")
            if lead is None:
                return ActionResult(success=False, error="lead_not_found")

            existing = self._fetch_one(
                "opportunities",
                {"lead_id": lead_id, "pipeline_id": pipeline_id},
                "id,equipe_id,pipeline_id,stage_id",
                order=("updated_at", False),
            )
            if existing is not None:
                return ActionResult(
                    success=True,
                    detail={
                        "action": "create_opportunity",
                        "created": False,
                        "opportunity_id": existing["id"],
                        "pipeline_id": existing["pipeline_id"],
                        "stage_id": existing["stage_id"],
                    },
                )

            if stage_id is None:
                stage = self._resolve_stage(pipeline_id=pipeline_id, stage_type="open", stage_name_hint=None)
                if stage is None:
                    return ActionResult(success=False, error="stage_not_found")
                stage_id = stage["id"]
            else:
                stage = self._fetch_one(
                    "pipeline_stages_v2",
                    {"id": stage_id, "pipeline_id": pipeline_id},
                    "id,equipe_id,pipeline_id",
                )
                if stage is None:
                    return ActionResult(success=False, error="stage_not_found")

            inserted = self._insert(
                "opportunities",
                {
                    "equipe_id": self.equipe_id,
                    "lead_id": lead_id,
                    "pipeline_id": pipeline_id,
                    "stage_id": stage_id,
                    "status": "open",
                },
                select="id,pipeline_id,stage_id",
            )
            data = inserted or {}
            return ActionResult(
                success=True,
                detail={
                    "action": "create_opportunity",
                    "created": True,
                    "opportunity_id": data.get("id"),
                    "pipeline_id": data.get("pipeline_id", pipeline_id),
                    "stage_id": data.get("stage_id", stage_id),
                },
            )
        except Exception as exc:
            return ActionResult(success=False, error=str(exc), detail={"action": "create_opportunity"})

    def _resolve_stage(self, *, pipeline_id: str, stage_type: str, stage_name_hint: str | None) -> dict[str, Any] | None:
        # Load ALL stages for the pipeline; the LLM often passes a real stage NAME
        # but a bogus stage_type (e.g. "pipeline"), so we resolve by name first and
        # only use stage_type as a fallback when it is a valid value.
        stages = self._fetch_many(
            "pipeline_stages_v2",
            {"pipeline_id": pipeline_id},
            "id,equipe_id,name,position,stage_type",
            order=("position", True),
        )
        if not stages:
            return None

        if stage_name_hint:
            needle = stage_name_hint.strip().lower()
            for stage in stages:  # exact name match
                if str(stage.get("name", "")).strip().lower() == needle:
                    return stage
            for stage in stages:  # then substring match
                if needle and needle in str(stage.get("name", "")).strip().lower():
                    return stage

        if stage_type in ("open", "won", "lost"):
            typed = [s for s in stages if s.get("stage_type") == stage_type]
            if typed:
                return typed[0]

        # A name hint was given but nothing matched → don't move to a wrong stage.
        if stage_name_hint:
            return None
        return stages[0]

    def _stamp_latest_stage_history(self, opportunity_id: str, to_stage_id: str) -> bool:
        history = self._fetch_one(
            "opportunity_stage_history",
            {"opportunity_id": opportunity_id, "to_stage_id": to_stage_id},
            "id,equipe_id",
            order=("changed_at", False),
        )
        if history is None:
            return False

        self._update(
            "opportunity_stage_history",
            {
                "actor": self.actor,
                "changed_by_type": "copilot" if self.actor == "copilot" else "team",
            },
            {"id": history["id"]},
        )
        return True

    def _fetch_one(
        self,
        table_name: str,
        filters: dict[str, Any],
        columns: str = "*",
        *,
        order: tuple[str, bool] | None = None,
    ) -> dict[str, Any] | None:
        rows = self._fetch_many(table_name, filters, columns, order=order, limit=1)
        return rows[0] if rows else None

    def _fetch_many(
        self,
        table_name: str,
        filters: dict[str, Any],
        columns: str = "*",
        *,
        order: tuple[str, bool] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        assert_table(table_name)
        query = self.client.table(table_name).select(columns).eq("equipe_id", self.equipe_id)
        for key, value in filters.items():
            query = query.eq(key, value)
        if hasattr(query, "is_") and table_name in {"opportunities", "pipeline_stages_v2"}:
            query = query.is_("deleted_at", "null")
        if order is not None:
            query = query.order(order[0], desc=not order[1])
        if limit is not None:
            query = query.limit(limit)

        data = self._execute(query)
        if data is None:
            rows: list[dict[str, Any]] = []
        elif isinstance(data, list):
            rows = data
        else:
            rows = [data]

        for row in rows:
            assert_equipe(row, self.equipe_id)
        return rows

    def _update(self, table_name: str, payload: dict[str, Any], filters: dict[str, Any]) -> None:
        assert_table(table_name)
        query = self.client.table(table_name).update(payload).eq("equipe_id", self.equipe_id)
        for key, value in filters.items():
            query = query.eq(key, value)
        self._execute(query)

    def _insert(self, table_name: str, payload: dict[str, Any], *, select: str | None = None) -> dict[str, Any] | None:
        assert_table(table_name)
        query = self.client.table(table_name).insert(payload)
        if select is not None:
            query = query.select(select)
            if hasattr(query, "single"):
                query = query.single()
        data = self._execute(query)
        if isinstance(data, list):
            return data[0] if data else None
        if isinstance(data, dict):
            if "equipe_id" in data:
                assert_equipe(data, self.equipe_id)
            return data
        return None

    @staticmethod
    def _execute(query: Any) -> Any:
        response = query.execute()
        error = getattr(response, "error", None)
        if error:
            raise RuntimeError(str(error))
        return getattr(response, "data", None)
