"""Merge derived heuristics, HF facts, and host overrides with provenance.

Precedence::

    user-supplied  >  HF factual  >  derived heuristic

Subjective fields (cost, speed, quality, ...) are never overwritten by a re-sync.
Factual fields are kept across re-syncs unless ``overwrite_factual=True``.
"""

from __future__ import annotations

from typing import Mapping

from ..models import (
    DERIVED,
    HUGGINGFACE,
    USER,
    AttributeValue,
    ModelEntry,
)

# Subjective attributes are derived heuristics or host opinion — never clobbered
# by a re-sync of factual HF data.
SUBJECTIVE_FIELDS = frozenset(
    {"cost", "speed", "quality", "instruction_following", "reasoning"}
)


def merge_attributes(
    entry: ModelEntry,
    facts: Mapping[str, AttributeValue],
    derived: Mapping[str, AttributeValue],
    *,
    overwrite_factual: bool = False,
) -> tuple[dict[str, AttributeValue], dict[str, str]]:
    """Return ``(attributes, provenance)`` for the enriched entry.

    Existing attributes whose provenance is ``user`` (or unknown — treated as
    host-authored) always win. Existing factual attributes are preserved across a
    re-sync unless ``overwrite_factual`` is set.
    """
    attributes: dict[str, AttributeValue] = {}
    provenance: dict[str, str] = {}

    # 1. Lowest priority: derived heuristics.
    for key, value in derived.items():
        attributes[key] = value
        provenance[key] = DERIVED

    # 2. HF factual data overlays derived.
    for key, value in facts.items():
        existing_is_factual = (
            key in entry.attributes and entry.provenance.get(key) == HUGGINGFACE
        )
        if existing_is_factual and not overwrite_factual:
            attributes[key] = entry.attributes[key]
        else:
            attributes[key] = value
        provenance[key] = HUGGINGFACE

    # 3. Highest priority: host-authored values win, always.
    for key, value in entry.attributes.items():
        source = entry.provenance.get(key, USER)
        if source in (HUGGINGFACE, DERIVED):
            # Re-derived / re-fetched above (subjective derived values are simply
            # recomputed; factual handled in step 2).
            if key in SUBJECTIVE_FIELDS and source == DERIVED and key not in derived:
                # No new derived value this round — keep the prior one.
                attributes[key] = value
                provenance[key] = DERIVED
            continue
        attributes[key] = value
        provenance[key] = source or USER

    return attributes, provenance
