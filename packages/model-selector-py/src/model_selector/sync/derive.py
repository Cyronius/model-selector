"""Derive crude normalized 1-10 attributes from HuggingFace facts.

HF exposes factual / open-weight data (params, context window, license, tags,
popularity) but *nothing* for cost / speed / quality. Rather than force the host
to hand-enter those, we derive crude normalized attributes from the facts and let
the host override anything it cares about. Every value here carries provenance
``derived`` so it is never confused with a fact or a host-authored value.

The heuristics are intentionally transparent and swappable: pass a custom
:class:`DerivationProfile` (or replace whole functions) to ``derive_attributes``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Mapping, Optional

from ..models import AttributeValue

Facts = Mapping[str, AttributeValue]
DeriveFn = Callable[[Facts], Optional[AttributeValue]]

_INSTRUCT_HINTS = ("instruct", "chat", "-it", "_it")


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _params_active(facts: Facts) -> float | None:
    pa = facts.get("params_active")
    if pa is None:
        pa = facts.get("params_total")
    return float(pa) if isinstance(pa, (int, float)) else None


def _is_instruction_tuned(facts: Facts) -> bool:
    repo = str(facts.get("hf_repo_id") or "").lower()
    if any(h in repo for h in _INSTRUCT_HINTS):
        return True
    tags = str(facts.get("tags") or "").lower()
    pipeline = str(facts.get("pipeline_tag") or "").lower()
    return "conversational" in tags or "text-generation" in pipeline and "chat" in tags


def _recency_bonus(facts: Facts) -> float:
    created = facts.get("created_at")
    if not isinstance(created, str) or not created:
        return 0.0
    try:
        year = int(created[:4])
    except ValueError:
        return 0.0
    if year >= 2025:
        return 0.5
    if year >= 2024:
        return 0.3
    return 0.0


def _popularity_bonus(facts: Facts) -> float:
    downloads = facts.get("downloads")
    if not isinstance(downloads, (int, float)):
        return 0.0
    if downloads >= 1_000_000:
        return 0.5
    if downloads >= 100_000:
        return 0.25
    return 0.0


def default_quality(facts: Facts) -> float | None:
    """Blend params with small bonuses — params alone mis-rank across generations."""
    pt = facts.get("params_total")
    if not isinstance(pt, (int, float)) or pt <= 0:
        return None
    base = _clamp(2 + 2.5 * math.log10(pt / 1e9), 1, 10)
    bonus = 0.0
    if _is_instruction_tuned(facts):
        bonus += 0.5
    bonus += _recency_bonus(facts)
    bonus += _popularity_bonus(facts)
    return round(_clamp(base + bonus, 1, 10), 1)


def default_speed(facts: Facts) -> float | None:
    """Inverse of *active* params, so MoE models score fast correctly."""
    pa = _params_active(facts)
    if pa is None or pa <= 0:
        return None
    return round(_clamp(11 - 2.5 * math.log10(pa / 1e9) - 2, 1, 10), 1)


def default_cost(facts: Facts) -> float | None:
    """Open weights: tracks active params (your infra). Proprietary: host-supplied."""
    pa = _params_active(facts)
    if pa is None or pa <= 0:
        return None
    return round(_clamp(1 + 2.5 * math.log10(pa / 1e9), 1, 10), 1)


@dataclass(frozen=True)
class DerivationProfile:
    """A swappable set of derivation heuristics. Each maps facts -> value | None."""

    quality: DeriveFn = default_quality
    speed: DeriveFn = default_speed
    cost: DeriveFn = default_cost


DEFAULT_PROFILE = DerivationProfile()


def derive_attributes(
    facts: Facts, profile: DerivationProfile | None = None
) -> dict[str, AttributeValue]:
    """Derive ``quality``/``speed``/``cost`` from facts; skip any that come back None."""
    profile = profile or DEFAULT_PROFILE
    derived: dict[str, AttributeValue] = {}
    for name, fn in (
        ("quality", profile.quality),
        ("speed", profile.speed),
        ("cost", profile.cost),
    ):
        value = fn(facts)
        if value is not None:
            derived[name] = value
    return derived
