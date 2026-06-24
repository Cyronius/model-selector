"""Selection: rank a registry against a query and pick the best match(es).

These functions never instantiate an LLM client. They return the host's own
model id(s) wrapped in :class:`MatchResult` metadata; client creation stays the
host's job.
"""

from __future__ import annotations

from typing import Mapping

from .models import ModelEntry, ModelRegistry
from .query.matcher import ModelAttributes, match_model
from .query.parser import parse_query
from .query.types import MatchResult


def _effective_attributes(entry: ModelEntry) -> ModelAttributes:
    """Attributes used for matching, with ``provider`` folded in.

    The pure matcher only knows about the attribute bag, so we surface the
    top-level ``provider`` as a matchable attribute (unless the host already put
    one in ``attributes``). This makes ``provider = openai`` queries work without
    the host duplicating the field.
    """
    if entry.provider is None or "provider" in entry.attributes:
        return entry.attributes
    return {**entry.attributes, "provider": entry.provider}


def rank_models(query: str, registry: ModelRegistry) -> list[MatchResult]:
    """Rank every entry in the registry, best (highest normalized score) first.

    The sort is stable, so entries with equal scores keep registry order.
    """
    parsed = parse_query(query, registry.aliases)
    results = [
        match_model(entry.id, _effective_attributes(entry), parsed)
        for entry in registry.entries
    ]
    results.sort(key=lambda r: r.normalized_score, reverse=True)
    return results


def select_model(
    query: str,
    registry: ModelRegistry,
    *,
    require_match: bool = False,
) -> MatchResult | None:
    """Return the single best match, or ``None``.

    With ``require_match=True``, returns ``None`` unless at least one condition
    matched (``result.matches``); otherwise it returns the best partial match.
    """
    ranked = rank_models(query, registry)
    if not ranked:
        return None
    best = ranked[0]
    if require_match and not best.matches:
        return None
    return best


def select_models(
    query: str,
    registry: ModelRegistry,
    *,
    count: int = 3,
    require_match: bool = False,
) -> list[MatchResult]:
    """Return the top-``count`` matches, best first. Useful for fallbacks."""
    ranked = rank_models(query, registry)
    if require_match:
        ranked = [r for r in ranked if r.matches]
    return ranked[:count]


def select_model_from(
    query: str,
    models: "list[ModelEntry | Mapping[str, object]]",
    *,
    aliases: Mapping[str, str] | None = None,
    require_match: bool = False,
) -> MatchResult | None:
    """Convenience: select from a plain list of entries/dicts (stateless path)."""
    registry = ModelRegistry.from_models(models, aliases)
    return select_model(query, registry, require_match=require_match)
