from collections.abc import Iterable
from typing import Protocol, TypeVar


class SkillLike(Protocol):
    name: str


SkillT = TypeVar("SkillT", bound=type[SkillLike])

_REGISTRY: dict[str, type[SkillLike]] = {}


class SkillRegistryError(KeyError):
    pass


def register(skill_cls: SkillT) -> SkillT:
    name = getattr(skill_cls, "name", None)
    if not isinstance(name, str) or not name:
        raise SkillRegistryError("skill class must define a non-empty name")
    _REGISTRY[name] = skill_cls
    return skill_cls


def get_skill(name: str) -> type[SkillLike]:
    try:
        return _REGISTRY[name]
    except KeyError as exc:
        raise SkillRegistryError(f"unknown skill: {name}") from exc


def active_skills(enabled_skills: Iterable[str] | None) -> list[type[SkillLike]]:
    if not enabled_skills:
        return []
    return [get_skill(name) for name in enabled_skills]

